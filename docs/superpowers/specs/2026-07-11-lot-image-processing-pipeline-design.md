# Lot Image Processing Pipeline — Design

**Date:** 2026-07-11
**Status:** Approved

## Relationship to prior spec

This spec extends [`2026-07-10-lot-image-management-design.md`](2026-07-10-lot-image-management-design.md), which fixes the upload → confirm → delete → reorder chain end to end and is unaffected by this spec except where noted below. That spec explicitly left "real thumbnail generation" and any async processing out of scope — this spec fills that gap and adds virus scanning, as a **reusable, config-driven library** rather than logic hardcoded into catalogue-service.

## Problem

Two gaps remain after the prior spec:

1. **No real thumbnail generation.** `${key}_thumb` is a URL convention with no pipeline behind it — every "thumbnail" is actually the full-size image.
2. **No malware protection.** Admin-uploaded files go straight from R2 to being served, with no scan step.

Both need async processing after upload (scanning and resizing a file inline in the request would make `confirm` slow and fragile). The processing logic should not be hardcoded into catalogue-service, because:

- The message broker (RabbitMQ today) and object storage (R2 today) are infrastructure choices that may change or vary per deployment.
- Other services in this monorepo may need the same "scan + thumbnail an uploaded file" capability in the future (e.g. a user-portal feature that accepts user-uploaded documents or avatars) and shouldn't reimplement it.

## Architecture: `packages/image-processing`

A new workspace package, following this repo's Clean Architecture layering, but packaged as a library instead of a deployed service:

```
packages/image-processing/
  src/
    domain/
      processing-job.ts       — ImageProcessingJob, ProcessingResult value objects
      ports/
        object-storage.ts     — ObjectStorage interface (getObject, putObject, deleteObject)
        virus-scanner.ts      — VirusScanner interface (scan)
        thumbnail-generator.ts — ThumbnailGenerator interface (generate)
        event-bus.ts          — EventBus interface (publish, subscribe)
    application/
      process-uploaded-image-use-case.ts
    infrastructure/
      storage/
        s3-compatible-storage.ts   — ships now (used for R2)
        aws-s3-storage.ts          — proof-of-concept only, not wired anywhere (see "Adapter swap guarantee")
      virus-scan/
        clamav-scanner.ts
        noop-scanner.ts            — used when virusScan.enabled = false
      thumbnail/
        sharp-thumbnail-generator.ts
        noop-thumbnail-generator.ts — used when thumbnail.enabled = false
      event-bus/
        rabbitmq-event-bus.ts      — ships now, wraps @carat-room/shared-events
        kafka-event-bus.ts         — proof-of-concept only, not wired anywhere
    index.ts                  — createImageProcessingModule(config): { start(), stop() }
```

**Layering rule (same as every other service in this repo):** `domain/` has zero imports from `infrastructure/` or any SDK (amqplib, kafkajs, @aws-sdk/*, sharp, clamd client). `application/` imports only `domain/`. `infrastructure/` implements `domain/` port interfaces. Enforced by the same root ESLint layer-boundary config as other packages.

### `createImageProcessingModule(config)`

```ts
interface ImageProcessingConfig {
  storage: { provider: 's3-compatible'; endpoint: string; bucket: string; credentials: {...} };
  virusScan: { enabled: boolean; clamd?: { host: string; port: number } };
  thumbnail: { enabled: boolean; maxWidthPx?: number };
  eventBus: {
    adapter: 'rabbitmq';
    uri: string;
    uploadedRoutingKey: string;
    processedRoutingKey: string;
    rejectedRoutingKey: string;
    maxRetries?: number; // default 3
  };
}
```

`start()` subscribes to `uploadedRoutingKey`. For each message `{ jobId, storageKey }`:
1. `ObjectStorage.getObject(storageKey)` to fetch the original.
2. If `virusScan.enabled`, run `VirusScanner.scan(buffer)`. If infected → publish to `rejectedRoutingKey` with `{ jobId, reason: 'virus_detected' }`, stop.
3. If `thumbnail.enabled`, run `ThumbnailGenerator.generate(buffer)`, then `ObjectStorage.putObject(`${storageKey}_thumb`, thumbnailBuffer)`.
4. Publish to `processedRoutingKey` with `{ jobId, thumbnailKey: `${storageKey}_thumb` }` (or without `thumbnailKey` if thumbnailing is disabled).

On any adapter error other than a scan verdict (broker unreachable, clamd unreachable, sharp throws), the `RabbitMqEventBus` adapter nacks and requeues with exponential backoff, capped at `maxRetries` (default 3). After the cap, it publishes to `rejectedRoutingKey` with `{ jobId, reason: 'processing_failed' }` itself — retry/backoff is broker-specific behaviour and belongs in the adapter, not the use case.

### Adapter swap guarantee

To prove the port design genuinely allows a "few lines of config + one adapter class" swap rather than just asserting it, this spec includes two proof-of-concept adapters, each unit-tested against the same port interface as the shipping adapter:

- `KafkaEventBus` (implements `EventBus` using `kafkajs`)
- `AwsS3Storage` (implements `ObjectStorage` using `@aws-sdk/client-s3` directly, as a genuinely different SDK from the R2 S3-compatible client — proving the port abstracts over more than "two S3-compatible endpoints")

Neither is wired into `createImageProcessingModule`'s factory switch, added to any `docker-compose.yml`, or given production config in this spec — they exist purely as compiled, tested evidence that swapping is cheap. Only `RabbitMqEventBus` and `S3CompatibleStorage` (R2) are active, production-configured adapters.

## Host wiring: catalogue-service

catalogue-service is the host process, since it already owns `Lot`/`LotImage` and R2 access. Its composition root (`src/main.ts`) constructs and starts the module at boot:

```ts
createImageProcessingModule({
  storage: { provider: 's3-compatible', endpoint: env.R2_ENDPOINT, bucket: env.R2_BUCKET, credentials: {...} },
  virusScan: { enabled: true, clamd: { host: env.CLAMD_HOST, port: env.CLAMD_PORT } },
  thumbnail: { enabled: true, maxWidthPx: 400 },
  eventBus: {
    adapter: 'rabbitmq',
    uri: env.RABBITMQ_URL,
    uploadedRoutingKey: 'lot.image.uploaded',
    processedRoutingKey: 'lot.image.processed',
    rejectedRoutingKey: 'lot.image.rejected',
  },
}).start();
```

Any future service that owns its own upload flow (e.g. a user-portal backend, if one is built) would do the same in its own composition root, with its own config — no shared runtime, no shared database, no code duplication beyond an import.

## Data model changes

`LotImage` (`apps/catalogue/src/domain/lot.ts`) gains two fields:

- `processingStatus: 'pending' | 'ready' | 'rejected'` — set to `'pending'` when the image is confirmed, updated by the new event consumer described below.
- `rejectionReason: 'virus_detected' | 'processing_failed' | null` — set only when `processingStatus === 'rejected'`.

Both fields are included in the `GET /api/lots` / `GET /api/lots/:id` response DTO (`key` stays excluded, per the prior spec) — the admin-portal needs them to render the pending-spinner and rejected-badge states.

## Catalogue-service changes

- `confirm-image-upload-use-case.ts`: creates the `LotImage` with `processingStatus: 'pending'`, saves the lot, then publishes `lot.image.uploaded` (`{ jobId: imageId, storageKey: key }`) via `@carat-room/shared-events`.
- **New consumer**, following the existing `consumerProxy` pattern, subscribed to `lot.image.processed` and `lot.image.rejected`: loads the lot, finds the image by id (`jobId`), updates `processingStatus` and either `thumbnailUrl` (derived from `thumbnailKey`) or `rejectionReason`, saves. No-ops (does not error) if the lot or image no longer exists — e.g. the admin deleted the image while processing was in flight.
- `DeleteImageUseCase`: unchanged logic. Deleting an image while `processingStatus === 'pending'` is valid; the later `lot.image.processed`/`rejected` event simply no-ops per the point above.
- `main.ts` composition root wires `createImageProcessingModule(...)` (see Host wiring above) alongside the existing consumer setup, and calls `.start()`.

## Admin-portal changes

- `image-uploader.tsx`: a tile with `processingStatus === 'pending'` shows the original image with a spinner overlay. `'rejected'` shows a red warning badge with a human-readable reason (`"Virus detected"` for `virus_detected`, `"Processing failed — try re-uploading"` for `processing_failed`) plus its own delete button — the admin decides whether to remove it, it is not auto-deleted. `'ready'` renders normally with its real generated thumbnail. The existing SWR 5-second polling picks up status transitions with no new realtime plumbing needed.
- `_actions.ts`: no action signature changes; `processingStatus`/`rejectionReason` flow through the existing `LotImage` type from `@carat-room/shared-types`, which gains the two fields.

## Multipart upload (size threshold)

Large original photography files (e.g. high-resolution jewellery shots) can exceed what a single presigned `PUT` handles comfortably. This adds a size-threshold branch to the existing upload flow — small files are unaffected.

- New config constant `MULTIPART_THRESHOLD_BYTES` in catalogue-service (default 20MB).
- `POST /api/lots/:id/images/upload-url` request body gains `fileSize`. If `fileSize <= MULTIPART_THRESHOLD_BYTES`, behaves exactly as today (single presigned PUT URL, response unchanged: `{ uploadUrl, imageKey }`). If larger, the endpoint instead calls R2's `CreateMultipartUpload` and returns `{ uploadId, imageKey, parts: [{ partNumber, uploadUrl }] }`, one presigned URL per 10MB part.
- **New endpoint** `POST /api/lots/:id/images/complete-multipart-upload` (body `{ uploadId, imageKey, parts: [{ partNumber, eTag }] }`): calls R2's `CompleteMultipartUpload`, then proceeds exactly like today's `confirm` step (creates the `LotImage` as `pending`, publishes `lot.image.uploaded`).
- `apps/admin/src/presentation/lots-router.ts`: new proxy route `POST /admin/api/lots/:id/images/complete-multipart-upload` forwarding to the new catalogue endpoint. The existing `upload-url` proxy is unchanged — it already forwards the request body/response verbatim, and the response shape now branches server-side on `fileSize`.
- `image-uploader.tsx`: for files at or under the threshold, the upload flow is unchanged (`getUploadUrl` → `PUT` → `confirmImage`). For files over the threshold: split the file into 10MB parts client-side, `PUT` each part to its presigned URL (3 in flight at a time), collect the returned `ETag` per part, then call a new `completeMultipartUpload(lotId, uploadId, imageKey, parts)` action instead of `confirmImage`. Any part `PUT` failure aborts the multipart upload (`AbortMultipartUpload`, via a new `abortMultipartUpload` action) and shows an inline error — no incomplete multipart uploads left dangling in R2.

## Infra changes

- `infra/rabbitmq/definitions.json`: add bindings for `lot.image.processed` and `lot.image.rejected` (consumed by catalogue-service's new consumer) and for `lot.image.uploaded` (consumed by the image-processing module hosted inside catalogue-service — same process, but the `RabbitMqEventBus` adapter still declares its own queue/binding).
- `docker-compose.yml` and `docker-compose.test.yml`: add a `clamav/clamav` container exposing `clamd`, as a new dependency for catalogue-service.
- `packages/image-processing/package.json`: new workspace member, depending on `sharp`, a `clamd`-protocol client, `@carat-room/shared-events` (for `RabbitMqEventBus`), and — dev-only, for the proof-of-concept adapters — `kafkajs` and `@aws-sdk/client-s3`.
- New catalogue-service env vars: `CLAMD_HOST`, `CLAMD_PORT`, `IMAGE_THUMBNAIL_MAX_WIDTH_PX`, `MULTIPART_THRESHOLD_BYTES`. Each must be diffed against `docker-compose.yml` for both dev and test compose files, per this repo's standing env-drift lesson.

## Error handling

- R2 `PUT` fails → inline error, `confirm`/`complete-multipart-upload` never called (unchanged from prior spec — no orphaned lot record).
- `confirm`/`complete-multipart-upload` fails after a successful upload → inline error shown to the admin; the R2 object(s) are orphaned. No cleanup job is in scope (unchanged from prior spec).
- A multipart part `PUT` fails mid-upload → client calls `abortMultipartUpload`, inline error shown, no dangling multipart upload in R2.
- `lot.image.uploaded` processing: virus detected → `processingStatus: 'rejected'`, `rejectionReason: 'virus_detected'`. The original is **not** auto-deleted from R2 — deletion stays a manual admin action via the existing delete flow, so a suspicious file remains available for inspection rather than disappearing silently.
- Transient failure (clamd unreachable, sharp throws, broker hiccup) → up to `maxRetries` (default 3) retries with exponential backoff inside `RabbitMqEventBus`; after the cap, `processingStatus: 'rejected'`, `rejectionReason: 'processing_failed'`.
- Delete with unknown `imageId` → `404`. Reorder with a mismatched id set → `400` (both unchanged from prior spec).

## Testing

- `packages/image-processing`:
  - `ProcessUploadedImageUseCase` unit tests using fake `ObjectStorage`/`VirusScanner`/`ThumbnailGenerator`: clean file → `ready` result with thumbnail key; infected file → `rejected`/`virus_detected`; each capability disabled via config → corresponding no-op adapter used and step skipped.
  - Adapter tests: `ClamAvScanner` (clean/infected fixture), `SharpThumbnailGenerator` (output is a valid, smaller image), `S3CompatibleStorage` (get/put/delete round-trip against a test bucket), `RabbitMqEventBus` (publish/subscribe round-trip; retry-then-give-up behavior capped at `maxRetries`).
  - Proof-of-concept adapters (`KafkaEventBus`, `AwsS3Storage`): unit tests against the same port interfaces as the shipping adapters, proving substitutability — not integration-tested against a real Kafka broker or AWS account.
- Catalogue-service:
  - `confirm-image-upload-use-case` test updated to assert `processingStatus: 'pending'` and the published `lot.image.uploaded` event.
  - New consumer tests: `lot.image.processed` updates `processingStatus`/`thumbnailUrl`; `lot.image.rejected` updates `processingStatus`/`rejectionReason`; both no-op cleanly when the lot/image no longer exists.
  - `upload-url`/`complete-multipart-upload` router tests: small file → unchanged single-URL response; large file → multipart response shape; complete → `LotImage` created as `pending`.
- Admin-service: `lots-router` test for the new `complete-multipart-upload` proxy route.
- Admin-portal: component tests for pending-spinner and rejected-badge rendering; multipart upload flow (chunk, parallel PUT, complete) and abort-on-failure.
- Manual verification (per this repo's standing "drive it in a real browser" lesson):
  1. Upload a normal-size image; confirm it shows pending → transitions to ready with a real (visibly resized) thumbnail within a few poll cycles.
  2. Upload the EICAR test file (standard harmless virus-scanner test string); confirm it's marked rejected with "Virus detected".
  3. Stop the `clamd` container mid-upload; confirm retry-then-reject behavior surfaces as "Processing failed — try re-uploading".
  4. Upload a file above the multipart threshold; confirm it completes and appears correctly after a page refresh.
  5. Cancel/kill a network connection mid-part-upload; confirm the multipart upload is aborted (no dangling upload left in R2) and an inline error is shown.

## Out of scope

- Preview generation, OCR — only thumbnail generation and virus scanning are implemented.
- Wiring `KafkaEventBus` or `AwsS3Storage` into any running service or config — proof-of-concept only, as described above.
- A cleanup job for R2 objects orphaned by rejected/failed processing, or by a failed `confirm`/`complete-multipart-upload` call.
- Pause/resume of an in-progress multipart upload across browser sessions (aborting and restarting from scratch on failure is the only recovery path).
- Deduplication and retention policies (shown in the reference diagram, not requested for lot images).
- Image editing (crop/rotate).
- Wiring `packages/image-processing` into a user-portal backend — no such upload use case exists yet; the library is built reusable, but only catalogue-service consumes it in this spec.

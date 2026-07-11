# Lot Image Processing Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real thumbnail generation and virus scanning for lot images via a reusable config-driven library (`packages/image-processing`), plus size-threshold multipart upload for large originals.

**Architecture:** A new workspace package with Clean Architecture layering (domain ports → application use case → infrastructure adapters) is hosted inside catalogue-service's composition root. Upload confirm publishes `lot.image.uploaded`; the module scans + thumbnails and publishes `lot.image.processed`/`lot.image.rejected`; a catalogue consumer updates `LotImage.processingStatus`. Multipart upload branches on a 20MB threshold in the existing upload-url endpoint.

**Tech Stack:** TypeScript 5.4, Hono, pnpm workspaces, RabbitMQ (amqplib via `@carat-room/shared-events`), `sharp`, raw clamd TCP client, `@aws-sdk/client-s3`, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-11-lot-image-processing-pipeline-design.md`

## PREREQUISITE

The plan `docs/superpowers/plans/2026-07-10-lot-image-management.md` MUST be fully executed first. It creates `DeleteImageUseCase`, `ReorderImagesUseCase`, the `confirm` proxy, migration `004_add_lot_image_key.sql` (the `key` column on `lot_images`), and the grid-based `image-uploader.tsx` this plan modifies. Verify before starting: `ls apps/catalogue/migrations/004_add_lot_image_key.sql` must exist. If it does not, STOP and execute that plan first.

## Global Constraints

- British English in all comments and copy ("authorise", "cancelled").
- Named exports only — never `export default`. Single quotes. No `var`. No `@ts-ignore`.
- Boolean names use `is/has/can/should/was/will` prefixes. No `Manager`/`Helper`/`Utils` class names.
- Test files co-located: `<file>.test.ts` next to source. Vitest. Never hit real AWS/RabbitMQ/clamd in unit tests.
- Clean Architecture: `domain/` imports nothing from other layers or SDKs; `application/` imports `domain/` only; `infrastructure/` implements domain ports; wiring only in composition roots. Enforced by root `eslint.config.mjs` — never add files to its legacy-debt block.
- Every migration must be mirrored into `tests/db-init/init.sql` in the same task, and must be idempotent (`ADD COLUMN IF NOT EXISTS`).
- Event payloads must be typed against `@carat-room/shared-types` on both producer and consumer sides.
- Env vars added to code must be added to `docker-compose.yml` AND `docker-compose.test.yml` in the same task.
- Response envelope: success `{ data }`, error `{ error: { code, message } }`.

---

### Task 1: Shared types — routing keys, event payloads, LotImage fields

**Files:**
- Modify: `packages/shared-types/src/events/index.ts`
- Create: `packages/shared-types/src/events/catalogue-events.ts`
- Modify: the file containing the shared `LotImage` interface (locate with `grep -rn "interface LotImage" packages/shared-types/src/`)

**Interfaces:**
- Produces: `ROUTING_KEYS.LOT_IMAGE_UPLOADED = 'lot.image.uploaded'`, `LOT_IMAGE_PROCESSED = 'lot.image.processed'`, `LOT_IMAGE_REJECTED = 'lot.image.rejected'`; payload types `LotImageUploadedPayload { jobId: string; storageKey: string }`, `LotImageProcessedPayload { jobId: string; thumbnailKey?: string }`, `LotImageRejectedPayload { jobId: string; reason: 'virus_detected' | 'processing_failed' }`; shared `LotImage` gains `processingStatus` / `rejectionReason`.

- [ ] **Step 1: Create the payload types file**

Create `packages/shared-types/src/events/catalogue-events.ts`:

```typescript
export interface LotImageUploadedPayload {
  jobId: string;
  storageKey: string;
}

export interface LotImageProcessedPayload {
  jobId: string;
  thumbnailKey?: string;
}

export type LotImageRejectionReason = 'virus_detected' | 'processing_failed';

export interface LotImageRejectedPayload {
  jobId: string;
  reason: LotImageRejectionReason;
}
```

- [ ] **Step 2: Register routing keys and re-export payloads**

In `packages/shared-types/src/events/index.ts`, add to the export block at the top:

```typescript
export type { LotImageUploadedPayload, LotImageProcessedPayload, LotImageRejectedPayload, LotImageRejectionReason } from './catalogue-events.js';
```

and add inside `ROUTING_KEYS` (before the closing `} as const;`):

```typescript
  LOT_IMAGE_UPLOADED: 'lot.image.uploaded',
  LOT_IMAGE_PROCESSED: 'lot.image.processed',
  LOT_IMAGE_REJECTED: 'lot.image.rejected',
```

- [ ] **Step 3: Extend the shared LotImage type**

Run `grep -rn "interface LotImage" packages/shared-types/src/`. Add to the interface:

```typescript
  processingStatus: 'pending' | 'ready' | 'rejected';
  rejectionReason: 'virus_detected' | 'processing_failed' | null;
```

If no shared `LotImage` exists in shared-types (only the catalogue domain one), skip this step — Task 8 covers the domain type — and note it in the commit message.

- [ ] **Step 4: Build and test**

Run: `pnpm turbo build --filter=@carat-room/shared-types && pnpm turbo test --filter=@carat-room/shared-types`
Expected: build PASS, tests PASS (or no tests found). If dependent apps now fail to compile because they construct `LotImage` literals, fix those literals with `processingStatus: 'ready', rejectionReason: null` defaults in the same commit.

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types
git commit -m "feat(shared-types): add lot image processing routing keys, payloads and LotImage status fields"
```

---

### Task 2: `packages/image-processing` scaffold — package, domain ports, layering

**Files:**
- Create: `packages/image-processing/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/image-processing/src/domain/processing-job.ts`
- Create: `packages/image-processing/src/domain/ports/object-storage.ts`, `virus-scanner.ts`, `thumbnail-generator.ts`, `event-bus.ts`
- Modify: root `eslint.config.mjs`

**Interfaces:**
- Produces (used by every later task):
  - `ObjectStorage { getObject(key: string): Promise<Buffer>; putObject(key: string, body: Buffer, contentType: string): Promise<void>; deleteObject(key: string): Promise<void> }`
  - `VirusScanner { scan(buffer: Buffer): Promise<ScanResult> }` with `ScanResult { isInfected: boolean }`
  - `ThumbnailGenerator { generate(buffer: Buffer, maxWidthPx: number): Promise<Buffer> }`
  - `EventBus { publish(routingKey: string, payload: unknown): Promise<void>; subscribe(routingKey: string, handler: EventHandler): Promise<void>; close(): Promise<void> }` with `EventHandler = (payload: unknown) => Promise<void>`
  - `ImageProcessingJob { jobId: string; storageKey: string }`; `ProcessingResult = { status: 'ready'; thumbnailKey?: string } | { status: 'rejected'; reason: ProcessingRejectionReason }`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@carat-room/image-processing",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc --build",
    "test": "vitest run"
  },
  "dependencies": {
    "@carat-room/shared-events": "workspace:*",
    "@carat-room/shared-types": "workspace:*",
    "sharp": "^0.33.4"
  },
  "devDependencies": {
    "@aws-sdk/client-s3": "^3.577.0",
    "@carat-room/tsconfig": "workspace:*",
    "kafkajs": "^2.2.4",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

Align `@aws-sdk/client-s3`, `typescript`, `vitest` versions with `apps/catalogue/package.json`. `kafkajs`/`@aws-sdk/client-s3` are devDependencies deliberately — the proof-of-concept adapters are test-only. Copy `tsconfig.json` and `vitest.config.ts` from `packages/shared-events/`, adjusting the package name. If the build needs amqplib types, add `amqplib` + `@types/amqplib` at the versions in `packages/shared-events/package.json`.

- [ ] **Step 2: Create domain value objects** — `src/domain/processing-job.ts`:

```typescript
export interface ImageProcessingJob {
  jobId: string;
  storageKey: string;
}

export type ProcessingRejectionReason = 'virus_detected' | 'processing_failed';

export type ProcessingResult =
  | { status: 'ready'; thumbnailKey?: string }
  | { status: 'rejected'; reason: ProcessingRejectionReason };
```

- [ ] **Step 3: Create the four ports**

`src/domain/ports/object-storage.ts`:

```typescript
export interface ObjectStorage {
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
}
```

`src/domain/ports/virus-scanner.ts`:

```typescript
export interface ScanResult {
  isInfected: boolean;
}

export interface VirusScanner {
  scan(buffer: Buffer): Promise<ScanResult>;
}
```

`src/domain/ports/thumbnail-generator.ts`:

```typescript
export interface ThumbnailGenerator {
  generate(buffer: Buffer, maxWidthPx: number): Promise<Buffer>;
}
```

`src/domain/ports/event-bus.ts`:

```typescript
export type EventHandler = (payload: unknown) => Promise<void>;

export interface EventBus {
  publish(routingKey: string, payload: unknown): Promise<void>;
  subscribe(routingKey: string, handler: EventHandler): Promise<void>;
  close(): Promise<void>;
}
```

- [ ] **Step 4: Add layer-boundary lint rules**

In root `eslint.config.mjs`, mirror the existing catalogue Clean Architecture blocks for `packages/image-processing`: `src/domain/**` may not import from `**/application/**`, `**/infrastructure/**`, `sharp`, `amqplib`, `kafkajs`, `@aws-sdk/*`; `src/application/**` may not import `**/infrastructure/**` or those SDKs. Follow the exact structure of the existing entries.

- [ ] **Step 5: Install, build, lint**

Run: `pnpm install && pnpm turbo build --filter=@carat-room/image-processing && pnpm lint`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/image-processing eslint.config.mjs pnpm-lock.yaml
git commit -m "feat(image-processing): scaffold package with domain ports and layer-boundary lint rules"
```

---

### Task 3: `ProcessUploadedImageUseCase` + no-op adapters (TDD)

**Files:**
- Create: `packages/image-processing/src/application/process-uploaded-image-use-case.ts` + `.test.ts`
- Create: `packages/image-processing/src/infrastructure/virus-scan/noop-scanner.ts`
- Create: `packages/image-processing/src/infrastructure/thumbnail/noop-thumbnail-generator.ts`

**Interfaces:**
- Consumes: all Task 2 ports.
- Produces: `ProcessUploadedImageUseCase` — constructor `(storage: ObjectStorage, scanner: VirusScanner, thumbnailer: ThumbnailGenerator, options: { isThumbnailEnabled: boolean; thumbnailMaxWidthPx: number })`; method `execute(job: ImageProcessingJob): Promise<ProcessingResult>`. `NoOpScanner` (always clean), `NoOpThumbnailGenerator` (throws if called — it must never be invoked when disabled; the use case skips the step).

- [ ] **Step 1: Write the failing tests**

`process-uploaded-image-use-case.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessUploadedImageUseCase } from './process-uploaded-image-use-case';
import type { ObjectStorage } from '../domain/ports/object-storage';
import type { VirusScanner } from '../domain/ports/virus-scanner';
import type { ThumbnailGenerator } from '../domain/ports/thumbnail-generator';

const buildStorage = (): ObjectStorage => ({
  getObject: vi.fn().mockResolvedValue(Buffer.from('original')),
  putObject: vi.fn().mockResolvedValue(undefined),
  deleteObject: vi.fn().mockResolvedValue(undefined),
});
const buildScanner = (isInfected = false): VirusScanner => ({
  scan: vi.fn().mockResolvedValue({ isInfected }),
});
const buildThumbnailer = (): ThumbnailGenerator => ({
  generate: vi.fn().mockResolvedValue(Buffer.from('thumb')),
});
const job = { jobId: 'img-1', storageKey: 'lots/lot-1/img-1' };

describe('ProcessUploadedImageUseCase', () => {
  it('should_returnReadyWithThumbnailKey_when_fileIsCleanAndThumbnailEnabled', async () => {
    const storage = buildStorage();
    const sut = new ProcessUploadedImageUseCase(storage, buildScanner(), buildThumbnailer(), { isThumbnailEnabled: true, thumbnailMaxWidthPx: 400 });

    const result = await sut.execute(job);

    expect(result).toEqual({ status: 'ready', thumbnailKey: 'lots/lot-1/img-1_thumb' });
    expect(storage.putObject).toHaveBeenCalledWith('lots/lot-1/img-1_thumb', Buffer.from('thumb'), 'image/jpeg');
  });

  it('should_returnRejectedVirusDetected_when_scannerFlagsFile', async () => {
    const storage = buildStorage();
    const thumbnailer = buildThumbnailer();
    const sut = new ProcessUploadedImageUseCase(storage, buildScanner(true), thumbnailer, { isThumbnailEnabled: true, thumbnailMaxWidthPx: 400 });

    const result = await sut.execute(job);

    expect(result).toEqual({ status: 'rejected', reason: 'virus_detected' });
    expect(thumbnailer.generate).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('should_returnReadyWithoutThumbnailKey_when_thumbnailDisabled', async () => {
    const thumbnailer = buildThumbnailer();
    const sut = new ProcessUploadedImageUseCase(buildStorage(), buildScanner(), thumbnailer, { isThumbnailEnabled: false, thumbnailMaxWidthPx: 400 });

    const result = await sut.execute(job);

    expect(result).toEqual({ status: 'ready' });
    expect(thumbnailer.generate).not.toHaveBeenCalled();
  });

  it('should_propagateError_when_storageOrScannerThrows', async () => {
    const storage = buildStorage();
    (storage.getObject as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const sut = new ProcessUploadedImageUseCase(storage, buildScanner(), buildThumbnailer(), { isThumbnailEnabled: true, thumbnailMaxWidthPx: 400 });

    await expect(sut.execute(job)).rejects.toThrow('boom');
  });
});
```

Note: transient errors propagate — retry/backoff and the final `processing_failed` publication are the event-bus adapter's job (Task 5), not the use case's.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @carat-room/image-processing test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the use case**

```typescript
import { ImageProcessingJob, ProcessingResult } from '../domain/processing-job';
import { ObjectStorage } from '../domain/ports/object-storage';
import { VirusScanner } from '../domain/ports/virus-scanner';
import { ThumbnailGenerator } from '../domain/ports/thumbnail-generator';

export interface ProcessingOptions {
  isThumbnailEnabled: boolean;
  thumbnailMaxWidthPx: number;
}

export class ProcessUploadedImageUseCase {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly scanner: VirusScanner,
    private readonly thumbnailer: ThumbnailGenerator,
    private readonly options: ProcessingOptions,
  ) {}

  async execute(job: ImageProcessingJob): Promise<ProcessingResult> {
    const original = await this.storage.getObject(job.storageKey);
    const scanResult = await this.scanner.scan(original);
    if (scanResult.isInfected) {
      return { status: 'rejected', reason: 'virus_detected' };
    }
    if (!this.options.isThumbnailEnabled) {
      return { status: 'ready' };
    }
    const thumbnail = await this.thumbnailer.generate(original, this.options.thumbnailMaxWidthPx);
    const thumbnailKey = `${job.storageKey}_thumb`;
    await this.storage.putObject(thumbnailKey, thumbnail, 'image/jpeg');
    return { status: 'ready', thumbnailKey };
  }
}
```

Virus scanning on/off is handled by injecting `NoOpScanner` (the factory in Task 6 decides), so the use case always calls `scan`. `noop-scanner.ts`:

```typescript
import { ScanResult, VirusScanner } from '../../domain/ports/virus-scanner';

export class NoOpScanner implements VirusScanner {
  async scan(): Promise<ScanResult> {
    return { isInfected: false };
  }
}
```

`noop-thumbnail-generator.ts`:

```typescript
import { ThumbnailGenerator } from '../../domain/ports/thumbnail-generator';

export class NoOpThumbnailGenerator implements ThumbnailGenerator {
  async generate(): Promise<Buffer> {
    throw new Error('NoOpThumbnailGenerator must never be invoked — thumbnailing is disabled');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @carat-room/image-processing test`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/image-processing/src
git commit -m "feat(image-processing): add ProcessUploadedImageUseCase with no-op adapters"
```

---

### Task 4: Real adapters — `SharpThumbnailGenerator`, `ClamAvScanner`, `S3CompatibleStorage` (TDD)

**Files:**
- Create: `packages/image-processing/src/infrastructure/thumbnail/sharp-thumbnail-generator.ts` + `.test.ts`
- Create: `packages/image-processing/src/infrastructure/virus-scan/clamav-scanner.ts` + `.test.ts`
- Create: `packages/image-processing/src/infrastructure/storage/s3-compatible-storage.ts` + `.test.ts`

**Interfaces:**
- Consumes: Task 2 ports.
- Produces: `SharpThumbnailGenerator` (no constructor args), `ClamAvScanner` (constructor `({ host: string; port: number })`, INSTREAM protocol over `node:net`), `S3CompatibleStorage` (constructor `({ endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string })`).

- [ ] **Step 1: Write failing tests**

`sharp-thumbnail-generator.test.ts` — use sharp itself to build the fixture and verify output:

```typescript
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { SharpThumbnailGenerator } from './sharp-thumbnail-generator';

describe('SharpThumbnailGenerator', () => {
  it('should_resizeToMaxWidth_when_imageIsWider', async () => {
    const input = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const sut = new SharpThumbnailGenerator();

    const output = await sut.generate(input, 400);

    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(400);
    expect(output.length).toBeLessThan(input.length + 1);
  });

  it('should_notUpscale_when_imageIsNarrowerThanMax', async () => {
    const input = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const sut = new SharpThumbnailGenerator();

    const output = await sut.generate(input, 400);

    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(200);
  });
});
```

`clamav-scanner.test.ts` — spin up a fake clamd on an ephemeral port with `node:net`; the INSTREAM protocol replies `stream: OK\0` for clean and `stream: Eicar-Signature FOUND\0` for infected:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { createServer, Server } from 'node:net';
import { ClamAvScanner } from './clamav-scanner';

let server: Server;
const listen = (reply: string): Promise<number> => new Promise(resolve => {
  server = createServer(socket => {
    socket.on('data', () => { /* consume INSTREAM chunks */ });
    socket.on('end', () => { /* client half-closed */ });
    setTimeout(() => { socket.write(`${reply}\0`); socket.end(); }, 20);
  });
  server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port));
});

afterEach(() => server?.close());

describe('ClamAvScanner', () => {
  it('should_reportClean_when_clamdRepliesOk', async () => {
    const port = await listen('stream: OK');
    const sut = new ClamAvScanner({ host: '127.0.0.1', port });

    const result = await sut.scan(Buffer.from('harmless'));

    expect(result.isInfected).toBe(false);
  });

  it('should_reportInfected_when_clamdRepliesFound', async () => {
    const port = await listen('stream: Eicar-Signature FOUND');
    const sut = new ClamAvScanner({ host: '127.0.0.1', port });

    const result = await sut.scan(Buffer.from('bad'));

    expect(result.isInfected).toBe(true);
  });

  it('should_reject_when_clamdIsUnreachable', async () => {
    const sut = new ClamAvScanner({ host: '127.0.0.1', port: 1 });

    await expect(sut.scan(Buffer.from('x'))).rejects.toThrow();
  });
});
```

`s3-compatible-storage.test.ts` — mock the S3 client with `aws-sdk-client-mock` style: use `vi.mock('@aws-sdk/client-s3')` OR add `aws-sdk-client-mock` as a devDependency (preferred, matches the monorepo convention). Assert: `getObject` sends `GetObjectCommand` with `{ Bucket, Key }` and returns the body as a Buffer; `putObject` sends `PutObjectCommand` with `Body`/`ContentType`; `deleteObject` sends `DeleteObjectCommand`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @carat-room/image-processing test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the three adapters**

`sharp-thumbnail-generator.ts`:

```typescript
import sharp from 'sharp';
import { ThumbnailGenerator } from '../../domain/ports/thumbnail-generator';

export class SharpThumbnailGenerator implements ThumbnailGenerator {
  async generate(buffer: Buffer, maxWidthPx: number): Promise<Buffer> {
    return sharp(buffer)
      .resize({ width: maxWidthPx, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  }
}
```

`clamav-scanner.ts` — clamd INSTREAM protocol: send `zINSTREAM\0`, then length-prefixed chunks (4-byte big-endian size + data), then a zero-length terminator; read the reply until `\0`:

```typescript
import { Socket } from 'node:net';
import { ScanResult, VirusScanner } from '../../domain/ports/virus-scanner';

export interface ClamAvConfig {
  host: string;
  port: number;
}

const SCAN_TIMEOUT_MS = 30_000;

export class ClamAvScanner implements VirusScanner {
  constructor(private readonly config: ClamAvConfig) {}

  scan(buffer: Buffer): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      let reply = '';
      socket.setTimeout(SCAN_TIMEOUT_MS);
      socket.on('timeout', () => { socket.destroy(); reject(new Error('clamd scan timed out')); });
      socket.on('error', reject);
      socket.on('data', chunk => { reply += chunk.toString(); });
      socket.on('close', () => {
        if (!reply) { reject(new Error('clamd closed without a reply')); return; }
        resolve({ isInfected: reply.includes('FOUND') });
      });
      socket.connect(this.config.port, this.config.host, () => {
        socket.write('zINSTREAM\0');
        const size = Buffer.alloc(4);
        size.writeUInt32BE(buffer.length, 0);
        socket.write(size);
        socket.write(buffer);
        socket.write(Buffer.alloc(4)); // zero-length chunk terminates the stream
      });
    });
  }
}
```

`s3-compatible-storage.ts`:

```typescript
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { ObjectStorage } from '../../domain/ports/object-storage';

export interface S3CompatibleConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class S3CompatibleStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3CompatibleConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async getObject(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error(`Object "${key}" has no body`);
    }
    return Buffer.from(bytes);
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
```

Move `@aws-sdk/client-s3` from devDependencies to dependencies in `packages/image-processing/package.json` (it is now used by a shipping adapter, not just the PoC).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @carat-room/image-processing test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/image-processing
git commit -m "feat(image-processing): add sharp, clamav and s3-compatible adapters"
```

---

### Task 5: `RabbitMqEventBus` with retry/backoff (TDD)

**Files:**
- Create: `packages/image-processing/src/infrastructure/event-bus/rabbitmq-event-bus.ts` + `.test.ts`

**Interfaces:**
- Consumes: `EventBus`, `EventHandler` from Task 2.
- Produces: `RabbitMqEventBus` — constructor `(connection: ChannelModel, options: { queueName: string; maxRetries?: number; onExhausted?: (payload: unknown) => Promise<void>; backoffBaseMs?: number })`. Implements `EventBus`. The host passes an amqplib connection created with `createAmqpConnection` from `@carat-room/shared-events`. On handler failure it republishes the message to its own queue with an incremented `x-retry-count` header after `backoffBaseMs * 2^retryCount` delay; when `retryCount >= maxRetries` (default 3) it calls `onExhausted(payload)` instead and acks.

- [ ] **Step 1: Write the failing test**

Mock amqplib channel objects with `vi.fn()` — no real broker:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RabbitMqEventBus } from './rabbitmq-event-bus';

type ConsumeCallback = (msg: { content: Buffer; properties: { headers?: Record<string, unknown> } }) => Promise<void>;

const buildChannel = () => ({
  assertExchange: vi.fn().mockResolvedValue(undefined),
  assertQueue: vi.fn().mockResolvedValue(undefined),
  bindQueue: vi.fn().mockResolvedValue(undefined),
  prefetch: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn().mockReturnValue(true),
  sendToQueue: vi.fn().mockReturnValue(true),
  ack: vi.fn(),
  consume: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
});

const buildConnection = (channel: ReturnType<typeof buildChannel>) => ({
  createChannel: vi.fn().mockResolvedValue(channel),
});

const message = (payload: unknown, retryCount?: number) => ({
  content: Buffer.from(JSON.stringify(payload)),
  properties: { headers: retryCount === undefined ? {} : { 'x-retry-count': retryCount } },
});

describe('RabbitMqEventBus', () => {
  let channel: ReturnType<typeof buildChannel>;
  let capturedConsumer: ConsumeCallback;

  beforeEach(() => {
    channel = buildChannel();
    channel.consume.mockImplementation((_queue: string, cb: ConsumeCallback) => { capturedConsumer = cb; return Promise.resolve(); });
  });

  it('should_ackMessage_when_handlerSucceeds', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const sut = new RabbitMqEventBus(buildConnection(channel) as never, { queueName: 'catalogue.image.processing' });
    await sut.subscribe('lot.image.uploaded', handler);

    await capturedConsumer(message({ jobId: 'a' }));

    expect(handler).toHaveBeenCalledWith({ jobId: 'a' });
    expect(channel.ack).toHaveBeenCalled();
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('should_requeueWithIncrementedRetryCount_when_handlerThrows', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('transient'));
    const sut = new RabbitMqEventBus(buildConnection(channel) as never, { queueName: 'catalogue.image.processing', backoffBaseMs: 1 });
    await sut.subscribe('lot.image.uploaded', handler);

    await capturedConsumer(message({ jobId: 'a' }, 1));

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      'catalogue.image.processing',
      expect.any(Buffer),
      expect.objectContaining({ headers: { 'x-retry-count': 2 } }),
    );
    expect(channel.ack).toHaveBeenCalled();
  });

  it('should_callOnExhaustedAndNotRequeue_when_retriesExceedMax', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('still failing'));
    const onExhausted = vi.fn().mockResolvedValue(undefined);
    const sut = new RabbitMqEventBus(buildConnection(channel) as never, { queueName: 'catalogue.image.processing', maxRetries: 3, backoffBaseMs: 1, onExhausted });
    await sut.subscribe('lot.image.uploaded', handler);

    await capturedConsumer(message({ jobId: 'a' }, 3));

    expect(onExhausted).toHaveBeenCalledWith({ jobId: 'a' });
    expect(channel.sendToQueue).not.toHaveBeenCalled();
    expect(channel.ack).toHaveBeenCalled();
  });

  it('should_publishToCaratEventsExchange_when_publishCalled', async () => {
    const sut = new RabbitMqEventBus(buildConnection(channel) as never, { queueName: 'q' });

    await sut.publish('lot.image.processed', { jobId: 'a' });

    expect(channel.publish).toHaveBeenCalledWith('carat.events', 'lot.image.processed', expect.any(Buffer), expect.objectContaining({ persistent: true }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @carat-room/image-processing test rabbitmq`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
import type { ChannelModel, Channel, ConsumeMessage } from 'amqplib';
import { EventBus, EventHandler } from '../../domain/ports/event-bus';

const EXCHANGE = 'carat.events';

export interface RabbitMqEventBusOptions {
  queueName: string;
  maxRetries?: number;
  backoffBaseMs?: number;
  onExhausted?: (payload: unknown) => Promise<void>;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class RabbitMqEventBus implements EventBus {
  private channelPromise: Promise<Channel> | null = null;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;

  constructor(
    private readonly connection: ChannelModel,
    private readonly options: RabbitMqEventBusOptions,
  ) {
    this.maxRetries = options.maxRetries ?? 3;
    this.backoffBaseMs = options.backoffBaseMs ?? 1000;
  }

  async publish(routingKey: string, payload: unknown): Promise<void> {
    const channel = await this.getChannel();
    const ok = channel.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: 'application/json',
    });
    if (!ok) {
      throw new Error(`[RabbitMqEventBus] Channel rejected publish with routing key "${routingKey}" — backpressure`);
    }
  }

  async subscribe(routingKey: string, handler: EventHandler): Promise<void> {
    const channel = await this.getChannel();
    await channel.assertQueue(this.options.queueName, { durable: true });
    await channel.bindQueue(this.options.queueName, EXCHANGE, routingKey);
    await channel.prefetch(1);
    await channel.consume(this.options.queueName, async (msg: ConsumeMessage | null) => {
      if (!msg) return;
      const payload = JSON.parse(msg.content.toString()) as unknown;
      const retryCount = Number(msg.properties.headers?.['x-retry-count'] ?? 0);
      try {
        await handler(payload);
      } catch (err) {
        console.error(`[RabbitMqEventBus] handler failed (attempt ${retryCount + 1}):`, err);
        if (retryCount >= this.maxRetries) {
          await this.options.onExhausted?.(payload);
        } else {
          await delay(this.backoffBaseMs * 2 ** retryCount);
          channel.sendToQueue(this.options.queueName, msg.content, {
            persistent: true,
            contentType: 'application/json',
            headers: { 'x-retry-count': retryCount + 1 },
          });
        }
      } finally {
        channel.ack(msg);
      }
    });
  }

  async close(): Promise<void> {
    if (this.channelPromise) {
      const ch = await this.channelPromise;
      await ch.close();
      this.channelPromise = null;
    }
  }

  private getChannel(): Promise<Channel> {
    if (!this.channelPromise) {
      this.channelPromise = this.connection.createChannel().then(async ch => {
        await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
        return ch;
      });
    }
    return this.channelPromise;
  }
}
```

Add `amqplib` (dependency) and `@types/amqplib` (devDependency) to `packages/image-processing/package.json` at the versions used by `packages/shared-events/package.json`, then `pnpm install`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @carat-room/image-processing test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/image-processing pnpm-lock.yaml
git commit -m "feat(image-processing): add RabbitMqEventBus with capped retry and backoff"
```

---

### Task 6: `createImageProcessingModule` factory + package index (TDD)

**Files:**
- Create: `packages/image-processing/src/create-image-processing-module.ts` + `.test.ts`
- Create: `packages/image-processing/src/index.ts`

**Interfaces:**
- Consumes: everything above.
- Produces (this is the package's public API, used by catalogue `main.ts` in Task 11):

```typescript
export interface ImageProcessingConfig {
  storage: { provider: 's3-compatible'; endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string };
  virusScan: { enabled: boolean; clamd?: { host: string; port: number } };
  thumbnail: { enabled: boolean; maxWidthPx?: number };
  eventBus: {
    adapter: 'rabbitmq';
    uri: string;
    uploadedRoutingKey: string;
    processedRoutingKey: string;
    rejectedRoutingKey: string;
    queueName: string;
    maxRetries?: number;
  };
}
export interface ImageProcessingModule { start(): Promise<void>; stop(): Promise<void> }
export function createImageProcessingModule(config: ImageProcessingConfig): ImageProcessingModule;
```

- [ ] **Step 1: Write the failing test**

Test the factory's orchestration with an injected fake bus via a second, test-only export `wireImageProcessing(useCase, bus, config)` — the pure wiring function the factory delegates to (keeps the factory itself a thin composition of constructors):

```typescript
import { describe, it, expect, vi } from 'vitest';
import { wireImageProcessing } from './create-image-processing-module';
import type { EventBus, EventHandler } from './domain/ports/event-bus';

const buildBus = () => {
  const handlers: Record<string, EventHandler> = {};
  const bus: EventBus = {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockImplementation(async (key: string, h: EventHandler) => { handlers[key] = h; }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return { bus, handlers };
};
const keys = { uploadedRoutingKey: 'lot.image.uploaded', processedRoutingKey: 'lot.image.processed', rejectedRoutingKey: 'lot.image.rejected' };

describe('wireImageProcessing', () => {
  it('should_publishProcessed_when_useCaseReturnsReady', async () => {
    const useCase = { execute: vi.fn().mockResolvedValue({ status: 'ready', thumbnailKey: 'k_thumb' }) };
    const { bus, handlers } = buildBus();
    const module = wireImageProcessing(useCase, bus, keys);
    await module.start();

    await handlers['lot.image.uploaded']({ jobId: 'j1', storageKey: 'k' });

    expect(useCase.execute).toHaveBeenCalledWith({ jobId: 'j1', storageKey: 'k' });
    expect(bus.publish).toHaveBeenCalledWith('lot.image.processed', { jobId: 'j1', thumbnailKey: 'k_thumb' });
  });

  it('should_publishRejected_when_useCaseReturnsRejected', async () => {
    const useCase = { execute: vi.fn().mockResolvedValue({ status: 'rejected', reason: 'virus_detected' }) };
    const { bus, handlers } = buildBus();
    const module = wireImageProcessing(useCase, bus, keys);
    await module.start();

    await handlers['lot.image.uploaded']({ jobId: 'j1', storageKey: 'k' });

    expect(bus.publish).toHaveBeenCalledWith('lot.image.rejected', { jobId: 'j1', reason: 'virus_detected' });
  });

  it('should_closeBus_when_stopped', async () => {
    const useCase = { execute: vi.fn() };
    const { bus } = buildBus();
    const module = wireImageProcessing(useCase, bus, keys);

    await module.stop();

    expect(bus.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @carat-room/image-processing test create-image`
Expected: FAIL.

- [ ] **Step 3: Implement**

`create-image-processing-module.ts`:

```typescript
import { createAmqpConnection } from '@carat-room/shared-events';
import { EventBus } from './domain/ports/event-bus';
import { ImageProcessingJob } from './domain/processing-job';
import { ProcessUploadedImageUseCase } from './application/process-uploaded-image-use-case';
import { S3CompatibleStorage } from './infrastructure/storage/s3-compatible-storage';
import { ClamAvScanner } from './infrastructure/virus-scan/clamav-scanner';
import { NoOpScanner } from './infrastructure/virus-scan/noop-scanner';
import { SharpThumbnailGenerator } from './infrastructure/thumbnail/sharp-thumbnail-generator';
import { NoOpThumbnailGenerator } from './infrastructure/thumbnail/noop-thumbnail-generator';
import { RabbitMqEventBus } from './infrastructure/event-bus/rabbitmq-event-bus';

const DEFAULT_THUMBNAIL_MAX_WIDTH_PX = 400;

export interface ImageProcessingConfig {
  storage: { provider: 's3-compatible'; endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string };
  virusScan: { enabled: boolean; clamd?: { host: string; port: number } };
  thumbnail: { enabled: boolean; maxWidthPx?: number };
  eventBus: {
    adapter: 'rabbitmq';
    uri: string;
    uploadedRoutingKey: string;
    processedRoutingKey: string;
    rejectedRoutingKey: string;
    queueName: string;
    maxRetries?: number;
  };
}

export interface ImageProcessingModule {
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface ProcessingRoutingKeys {
  uploadedRoutingKey: string;
  processedRoutingKey: string;
  rejectedRoutingKey: string;
}

interface Processor {
  execute(job: ImageProcessingJob): Promise<{ status: 'ready'; thumbnailKey?: string } | { status: 'rejected'; reason: string }>;
}

export function wireImageProcessing(useCase: Processor, bus: EventBus, keys: ProcessingRoutingKeys): ImageProcessingModule {
  return {
    async start(): Promise<void> {
      await bus.subscribe(keys.uploadedRoutingKey, async payload => {
        const job = payload as ImageProcessingJob;
        const result = await useCase.execute(job);
        if (result.status === 'rejected') {
          await bus.publish(keys.rejectedRoutingKey, { jobId: job.jobId, reason: result.reason });
        } else {
          await bus.publish(keys.processedRoutingKey, { jobId: job.jobId, thumbnailKey: result.thumbnailKey });
        }
      });
    },
    async stop(): Promise<void> {
      await bus.close();
    },
  };
}

export function createImageProcessingModule(config: ImageProcessingConfig): ImageProcessingModule {
  if (config.virusScan.enabled && !config.virusScan.clamd) {
    throw new Error('virusScan.clamd config is required when virus scanning is enabled');
  }
  const storage = new S3CompatibleStorage(config.storage);
  const scanner = config.virusScan.enabled && config.virusScan.clamd ? new ClamAvScanner(config.virusScan.clamd) : new NoOpScanner();
  const thumbnailer = config.thumbnail.enabled ? new SharpThumbnailGenerator() : new NoOpThumbnailGenerator();
  const useCase = new ProcessUploadedImageUseCase(storage, scanner, thumbnailer, {
    isThumbnailEnabled: config.thumbnail.enabled,
    thumbnailMaxWidthPx: config.thumbnail.maxWidthPx ?? DEFAULT_THUMBNAIL_MAX_WIDTH_PX,
  });

  let bus: EventBus | null = null;
  let inner: ImageProcessingModule | null = null;
  return {
    async start(): Promise<void> {
      const connection = await createAmqpConnection(config.eventBus.uri);
      const rabbitBus = new RabbitMqEventBus(connection, {
        queueName: config.eventBus.queueName,
        maxRetries: config.eventBus.maxRetries,
        onExhausted: async payload => {
          const job = payload as ImageProcessingJob;
          await rabbitBus.publish(config.eventBus.rejectedRoutingKey, { jobId: job.jobId, reason: 'processing_failed' });
        },
      });
      bus = rabbitBus;
      inner = wireImageProcessing(useCase, rabbitBus, config.eventBus);
      await inner.start();
    },
    async stop(): Promise<void> {
      await bus?.close();
    },
  };
}
```

Check the actual export name for the connection helper: `grep -n "export" packages/shared-events/src/index.ts` — the CLAUDE.md names it `createAmqpConnection`; use whatever the index actually exports and match its signature.

`index.ts`:

```typescript
export { createImageProcessingModule } from './create-image-processing-module.js';
export type { ImageProcessingConfig, ImageProcessingModule } from './create-image-processing-module.js';
export type { ObjectStorage } from './domain/ports/object-storage.js';
export type { VirusScanner, ScanResult } from './domain/ports/virus-scanner.js';
export type { ThumbnailGenerator } from './domain/ports/thumbnail-generator.js';
export type { EventBus, EventHandler } from './domain/ports/event-bus.js';
export type { ImageProcessingJob, ProcessingResult } from './domain/processing-job.js';
```

(Match the `.js` extension convention used in `packages/shared-events/src/index.ts` — drop the extensions if that file doesn't use them.)

- [ ] **Step 4: Run all package tests**

Run: `pnpm --filter @carat-room/image-processing test && pnpm turbo build --filter=@carat-room/image-processing && pnpm lint`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/image-processing
git commit -m "feat(image-processing): add createImageProcessingModule factory and public API"
```

---

### Task 7: Proof-of-concept adapters — `KafkaEventBus`, `AwsS3Storage`

Purpose (from spec): compiled, unit-tested evidence that swapping broker/storage is one adapter class + config. NOT wired into the factory, docker-compose, or any service.

**Files:**
- Create: `packages/image-processing/src/infrastructure/event-bus/kafka-event-bus.ts` + `.test.ts`
- Create: `packages/image-processing/src/infrastructure/storage/aws-s3-storage.ts` + `.test.ts`

**Interfaces:**
- Consumes: `EventBus`, `ObjectStorage` ports.
- Produces: nothing used elsewhere — deliberately unexported from `index.ts`.

- [ ] **Step 1: Write failing tests** — both tests assert the class satisfies the port and delegates to a mocked client. For `KafkaEventBus`, mock `kafkajs`'s `Kafka` (producer.send / consumer.run) with `vi.mock('kafkajs')`; assert `publish` sends to a topic derived from the routing key (dots → hyphens: `lot.image.uploaded` → topic `lot-image-uploaded`) and `subscribe` registers an `eachMessage` handler that parses JSON and calls the `EventHandler`. For `AwsS3Storage`, same three assertions as the `S3CompatibleStorage` test (GetObject/PutObject/DeleteObject) but constructing with `{ region, bucket, credentials }` and NO endpoint override — plain AWS.

- [ ] **Step 2: Run tests to verify they fail** — `pnpm --filter @carat-room/image-processing test kafka aws-s3` → FAIL.

- [ ] **Step 3: Implement both adapters minimally**

`kafka-event-bus.ts` (shape; fill mechanics to satisfy the tests):

```typescript
import { Kafka, Producer, Consumer } from 'kafkajs';
import { EventBus, EventHandler } from '../../domain/ports/event-bus';

const toTopic = (routingKey: string): string => routingKey.replace(/\./g, '-');

export interface KafkaEventBusConfig {
  brokers: string[];
  clientId: string;
  groupId: string;
}

export class KafkaEventBus implements EventBus {
  private readonly kafka: Kafka;
  private producer: Producer | null = null;
  private consumer: Consumer | null = null;

  constructor(private readonly config: KafkaEventBusConfig) {
    this.kafka = new Kafka({ clientId: config.clientId, brokers: config.brokers });
  }

  async publish(routingKey: string, payload: unknown): Promise<void> {
    if (!this.producer) {
      this.producer = this.kafka.producer();
      await this.producer.connect();
    }
    await this.producer.send({ topic: toTopic(routingKey), messages: [{ value: JSON.stringify(payload) }] });
  }

  async subscribe(routingKey: string, handler: EventHandler): Promise<void> {
    this.consumer = this.kafka.consumer({ groupId: this.config.groupId });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: toTopic(routingKey) });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        await handler(JSON.parse(message.value.toString()) as unknown);
      },
    });
  }

  async close(): Promise<void> {
    await this.producer?.disconnect();
    await this.consumer?.disconnect();
  }
}
```

`aws-s3-storage.ts`: identical to `S3CompatibleStorage` but constructor `({ region, bucket, accessKeyId, secretAccessKey })` with no `endpoint`.

- [ ] **Step 4: Run tests to verify they pass** — `pnpm --filter @carat-room/image-processing test` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/image-processing
git commit -m "test(image-processing): add Kafka and AWS S3 proof-of-concept adapters proving port swappability"
```

---

### Task 8: Catalogue — migration 005, domain fields, repository mapping, DTO

**Files:**
- Create: `apps/catalogue/migrations/005_add_lot_image_processing.sql`
- Modify: `tests/db-init/init.sql`
- Modify: `apps/catalogue/src/domain/lot.ts`
- Modify: `apps/catalogue/src/infrastructure/postgres-lot-repository.ts` + its `.test.ts`
- Modify: the lot response DTO mapper created by the prerequisite plan (grep `thumbnailUrl` under `apps/catalogue/src/presentation/` to find it)

**Interfaces:**
- Produces: `LotImage` (catalogue domain) gains `processingStatus: LotImageProcessingStatus` (`'pending' | 'ready' | 'rejected'`) and `rejectionReason: LotImageRejectionReason | null`; DTO exposes both; DB columns `processing_status TEXT NOT NULL DEFAULT 'ready'`, `rejection_reason TEXT NULL`.

- [ ] **Step 1: Write the migration**

`apps/catalogue/migrations/005_add_lot_image_processing.sql`:

```sql
ALTER TABLE lot_images ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE lot_images ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;
```

Default `'ready'` grandfathers existing images (they render today; marking them `pending` would spinner-lock them forever).

Mirror in `tests/db-init/init.sql` immediately after the migration-004 block:

```sql
-- Migration 005: lot image processing status (mirrors apps/catalogue/migrations/005)
ALTER TABLE lot_images ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE lot_images ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;
```

- [ ] **Step 2: Extend the domain type**

In `apps/catalogue/src/domain/lot.ts`, add above `LotImage`:

```typescript
export type LotImageProcessingStatus = 'pending' | 'ready' | 'rejected';
export type LotImageRejectionReason = 'virus_detected' | 'processing_failed';
```

and add to `LotImage`:

```typescript
  processingStatus: LotImageProcessingStatus;
  rejectionReason: LotImageRejectionReason | null;
```

- [ ] **Step 3: Fix compile errors test-first**

Run: `pnpm turbo build --filter=catalogue` — every `LotImage` literal now fails to compile. Fix each: `postgres-lot-repository.ts` (add `processing_status`/`rejection_reason` to the image row type, both SELECTs, and the INSERT column list + values), `confirm-image-upload-use-case.ts` (temporary: `processingStatus: 'ready', rejectionReason: null` — Task 9 changes this to `'pending'`), the DTO mapper (add both fields to the mapped output — `key` stays excluded), plus any test builders. Add one repository test asserting a saved image round-trips `processingStatus: 'rejected'`, `rejectionReason: 'virus_detected'`.

- [ ] **Step 4: Run catalogue tests**

Run: `pnpm turbo test --filter=catalogue`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/catalogue tests/db-init/init.sql
git commit -m "feat(catalogue): add processing status and rejection reason to lot images"
```

---

### Task 9: Catalogue — confirm publishes `lot.image.uploaded` (TDD)

**Files:**
- Modify: `apps/catalogue/src/application/confirm-image-upload-use-case.ts`
- Modify: `apps/catalogue/src/application/use-cases.test.ts` (confirm-image tests live here)

**Interfaces:**
- Consumes: `EventPublisher` from `@carat-room/shared-events` (`publish(routingKey: RoutingKey, payload: T)`), `ROUTING_KEYS.LOT_IMAGE_UPLOADED` + `LotImageUploadedPayload` from Task 1.
- Produces: `ConfirmImageUploadUseCase` constructor becomes `(lotRepository, imageStorage, eventPublisher: Pick<EventPublisher, 'publish'>)`. New images created with `processingStatus: 'pending'`, `rejectionReason: null`. After `save`, publishes `LOT_IMAGE_UPLOADED` with `{ jobId: newImage.id, storageKey: imageKey }`. Task 11 updates `main.ts` wiring.

- [ ] **Step 1: Write/extend the failing test**

In the existing confirm-image describe block, inject `const eventPublisher = { publish: vi.fn().mockResolvedValue(undefined) };` as the third constructor arg and add:

```typescript
it('should_createPendingImageAndPublishUploadedEvent_when_confirmSucceeds', async () => {
  await sut.execute('lot-1', 'lots/lot-1/key-1', false);

  const savedLot = mockLotRepository.save.mock.calls[0][0];
  const newImage = savedLot.images[savedLot.images.length - 1];
  expect(newImage.processingStatus).toBe('pending');
  expect(newImage.rejectionReason).toBeNull();
  expect(eventPublisher.publish).toHaveBeenCalledWith('lot.image.uploaded', { jobId: newImage.id, storageKey: 'lots/lot-1/key-1' });
});

it('should_notPublish_when_lotNotFound', async () => {
  mockLotRepository.findById.mockResolvedValue(null);

  await expect(sut.execute('missing', 'k', false)).rejects.toThrow(LotNotFoundError);

  expect(eventPublisher.publish).not.toHaveBeenCalled();
});
```

(Adapt mock names to the file's existing conventions.)

- [ ] **Step 2: Run tests to verify they fail** — `pnpm turbo test --filter=catalogue -- use-cases` → FAIL.

- [ ] **Step 3: Implement** — add the constructor param and change the image creation:

```typescript
    const newImage: LotImage = {
      id: uuidv4(),
      lotId,
      url,
      thumbnailUrl,
      displayOrder: lot.images.length,
      isPrimary,
      processingStatus: 'pending',
      rejectionReason: null,
    };
```

and after `await this.lotRepository.save(updatedLot);`:

```typescript
    const payload: LotImageUploadedPayload = { jobId: newImage.id, storageKey: imageKey };
    await this.eventPublisher.publish(ROUTING_KEYS.LOT_IMAGE_UPLOADED, payload);
```

with imports `import { ROUTING_KEYS, LotImageUploadedPayload } from '@carat-room/shared-types';`. Note the use case also needs to return the created image if the prerequisite plan made it do so — preserve that return shape.

- [ ] **Step 4: Run tests to verify they pass** — `pnpm turbo test --filter=catalogue` → PASS (main.ts compile error for the new constructor arg is fixed in Task 11; if the build breaks now, pass a temporary `new EventPublisher(...)` wired from `RABBITMQ_URL` in main.ts as part of this task instead).

- [ ] **Step 5: Commit**

```bash
git add apps/catalogue
git commit -m "feat(catalogue): publish lot.image.uploaded and create images as pending on confirm"
```

---

### Task 10: Catalogue — `lot.image.processed`/`rejected` consumer (TDD)

**Files:**
- Create: `apps/catalogue/src/application/apply-image-processing-result-use-case.ts` + `.test.ts`

**Interfaces:**
- Consumes: `LotRepository`, `ImageStorage.getPublicUrl`, payload types from Task 1.
- Produces: `ApplyImageProcessingResultUseCase` — constructor `(lotRepository: LotRepository, imageStorage: ImageStorage)`; methods `applyProcessed(payload: LotImageProcessedPayload): Promise<void>` and `applyRejected(payload: LotImageRejectedPayload): Promise<void>`. Both scan all lots? No — `jobId` IS the image id, but the payload has no lotId; add `findByImageId(imageId: string): Promise<Lot | null>` to `LotRepository` (SQL: `SELECT lot_id FROM lot_images WHERE id = $1` then reuse `findById`). Both methods no-op silently when no lot/image matches.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApplyImageProcessingResultUseCase } from './apply-image-processing-result-use-case';
import { Lot } from '../domain/lot';

const buildLot = (imageOverrides = {}) => new Lot({
  id: 'lot-1', title: 'Ring', description: null, categoryId: null, condition: null,
  estimatedValue: null, createdBy: null, createdAt: new Date(), updatedAt: new Date(),
  images: [{
    id: 'img-1', lotId: 'lot-1', url: 'https://cdn/x', thumbnailUrl: 'https://cdn/x_thumb',
    displayOrder: 0, isPrimary: true, processingStatus: 'pending', rejectionReason: null,
    key: 'lots/lot-1/img-1', ...imageOverrides,
  }],
});

describe('ApplyImageProcessingResultUseCase', () => {
  let lotRepository: { findByImageId: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
  let sut: ApplyImageProcessingResultUseCase;

  beforeEach(() => {
    lotRepository = { findByImageId: vi.fn().mockResolvedValue(buildLot()), save: vi.fn().mockResolvedValue(undefined) };
    const imageStorage = { getPublicUrl: vi.fn().mockImplementation(async (k: string) => `https://cdn/${k}`) };
    sut = new ApplyImageProcessingResultUseCase(lotRepository as never, imageStorage as never);
  });

  it('should_markImageReadyWithThumbnailUrl_when_processedEventArrives', async () => {
    await sut.applyProcessed({ jobId: 'img-1', thumbnailKey: 'lots/lot-1/img-1_thumb' });

    const saved = lotRepository.save.mock.calls[0][0];
    expect(saved.images[0].processingStatus).toBe('ready');
    expect(saved.images[0].thumbnailUrl).toBe('https://cdn/lots/lot-1/img-1_thumb');
  });

  it('should_markImageRejectedWithReason_when_rejectedEventArrives', async () => {
    await sut.applyRejected({ jobId: 'img-1', reason: 'virus_detected' });

    const saved = lotRepository.save.mock.calls[0][0];
    expect(saved.images[0].processingStatus).toBe('rejected');
    expect(saved.images[0].rejectionReason).toBe('virus_detected');
  });

  it('should_noOpWithoutSaving_when_imageNoLongerExists', async () => {
    lotRepository.findByImageId.mockResolvedValue(null);

    await sut.applyProcessed({ jobId: 'gone', thumbnailKey: 'k_thumb' });

    expect(lotRepository.save).not.toHaveBeenCalled();
  });
});
```

(If the prerequisite plan did not add `key` to the domain `LotImage`, drop it from the builder.)

- [ ] **Step 2: Run tests to verify they fail** — FAIL, module not found.

- [ ] **Step 3: Implement**

Add to `LotRepository` interface (`apps/catalogue/src/domain/lot-repository.ts`): `findByImageId(imageId: string): Promise<Lot | null>;` and implement in `PostgresLotRepository`:

```typescript
  async findByImageId(imageId: string): Promise<Lot | null> {
    const rows = await this.db<{ lot_id: string }[]>`
      SELECT lot_id FROM lot_images WHERE id = ${imageId}
    `;
    if (rows.length === 0) return null;
    return this.findById(rows[0].lot_id);
  }
```

(Match the file's existing sql-template style exactly.) Then the use case:

```typescript
import { Lot, LotImage, LotImageRejectionReason } from '../domain/lot';
import { LotRepository } from '../domain/lot-repository';
import { ImageStorage } from './image-storage';
import { LotImageProcessedPayload, LotImageRejectedPayload } from '@carat-room/shared-types';

export class ApplyImageProcessingResultUseCase {
  constructor(
    private readonly lotRepository: LotRepository,
    private readonly imageStorage: ImageStorage,
  ) {}

  async applyProcessed(payload: LotImageProcessedPayload): Promise<void> {
    await this.updateImage(payload.jobId, async img => ({
      ...img,
      processingStatus: 'ready',
      rejectionReason: null,
      thumbnailUrl: payload.thumbnailKey ? await this.imageStorage.getPublicUrl(payload.thumbnailKey) : img.thumbnailUrl,
    }));
  }

  async applyRejected(payload: LotImageRejectedPayload): Promise<void> {
    await this.updateImage(payload.jobId, async img => ({
      ...img,
      processingStatus: 'rejected',
      rejectionReason: payload.reason as LotImageRejectionReason,
    }));
  }

  private async updateImage(imageId: string, transform: (img: LotImage) => Promise<LotImage>): Promise<void> {
    const lot = await this.lotRepository.findByImageId(imageId);
    if (!lot) return;
    const target = lot.images.find(img => img.id === imageId);
    if (!target) return;
    const updatedImages = await Promise.all(lot.images.map(img => (img.id === imageId ? transform(img) : Promise.resolve(img))));
    const updatedLot = new Lot({ ...lot, images: updatedImages, updatedAt: new Date() });
    await this.lotRepository.save(updatedLot);
  }
}
```

Note: `new Lot({ ...lot })` works because `Lot`'s fields mirror `LotProps`; if the constructor rejects extra fields, spell the props out as `confirm-image-upload-use-case.ts` does. Add a repository test for `findByImageId` (found + not-found).

- [ ] **Step 4: Run tests** — `pnpm turbo test --filter=catalogue` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/catalogue
git commit -m "feat(catalogue): apply image processing results from processed and rejected events"
```

---

### Task 11: Catalogue — composition-root wiring + env vars

**Files:**
- Modify: `apps/catalogue/src/main.ts`
- Modify: `docker-compose.yml`, `docker-compose.test.yml` (catalogue-service environment blocks — env vars only; the clamav container itself is Task 14)

**Interfaces:**
- Consumes: `createImageProcessingModule` (Task 6), `ApplyImageProcessingResultUseCase` (Task 10), `EventPublisher`/`EventSubscriber`/`createAmqpConnection` from `@carat-room/shared-events`, `ROUTING_KEYS` from shared-types.
- Produces: running consumers at boot; env contract `RABBITMQ_URL`, `CLAMD_HOST`, `CLAMD_PORT`, `IMAGE_THUMBNAIL_MAX_WIDTH_PX`, `R2_PUBLIC_BASE_URL` (verify this one is already in compose — the code reads it today).

- [ ] **Step 1: Wire in main.ts**

Add imports and, after the existing `imageStorage` block:

```typescript
const rabbitmqUrl = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';
const clamdHost = process.env.CLAMD_HOST ?? 'clamav';
const clamdPort = Number(process.env.CLAMD_PORT ?? 3310);
const thumbnailMaxWidthPx = Number(process.env.IMAGE_THUMBNAIL_MAX_WIDTH_PX ?? 400);
```

Update the `confirmImageUpload` use-case construction to pass the publisher, and add the new use case:

```typescript
  confirmImageUpload: new ConfirmImageUploadUseCase(lotRepository, imageStorage, eventPublisher),
  applyImageProcessingResult: new ApplyImageProcessingResultUseCase(lotRepository, imageStorage),
```

where `eventPublisher` is built at boot (before the useCases block) from a shared connection. Then extend the boot sequence:

```typescript
runMigrations(db, join(__dirname, '..', 'migrations'))
  .then(async () => {
    const connection = await createAmqpConnection(rabbitmqUrl);
    const subscriber = new EventSubscriber(connection);
    await subscriber.subscribe('catalogue.image.processed', payload => useCases.applyImageProcessingResult.applyProcessed(payload as LotImageProcessedPayload), ROUTING_KEYS.LOT_IMAGE_PROCESSED);
    await subscriber.subscribe('catalogue.image.rejected', payload => useCases.applyImageProcessingResult.applyRejected(payload as LotImageRejectedPayload), ROUTING_KEYS.LOT_IMAGE_REJECTED);

    await createImageProcessingModule({
      storage: {
        provider: 's3-compatible',
        endpoint: `https://${process.env.R2_ACCOUNT_ID ?? ''}.r2.cloudflarestorage.com`,
        region: 'auto',
        bucket: process.env.R2_BUCKET ?? '',
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
      virusScan: { enabled: true, clamd: { host: clamdHost, port: clamdPort } },
      thumbnail: { enabled: true, maxWidthPx: thumbnailMaxWidthPx },
      eventBus: {
        adapter: 'rabbitmq',
        uri: rabbitmqUrl,
        uploadedRoutingKey: ROUTING_KEYS.LOT_IMAGE_UPLOADED,
        processedRoutingKey: ROUTING_KEYS.LOT_IMAGE_PROCESSED,
        rejectedRoutingKey: ROUTING_KEYS.LOT_IMAGE_REJECTED,
        queueName: 'catalogue.image.processing',
      },
    }).start();

    serve({ fetch: app.fetch, port: PORT });
  })
```

Check how `eventPublisher` should share the connection: build `const connection = await createAmqpConnection(rabbitmqUrl)` FIRST, construct `new EventPublisher(connection)`, then construct the `useCases` object inside the async boot block (move the object construction if necessary — it currently sits at module top level; restructure minimally so `useCases` still reaches the routers).

Add `@carat-room/image-processing` to `apps/catalogue/package.json` dependencies (`"workspace:*"`), and `pnpm install`.

- [ ] **Step 2: Add env vars to both compose files**

In `docker-compose.yml` catalogue-service `environment:` (RABBITMQ_URL already exists), add:

```yaml
      R2_PUBLIC_BASE_URL: ${R2_PUBLIC_BASE_URL}
      CLAMD_HOST: clamav
      CLAMD_PORT: "3310"
      IMAGE_THUMBNAIL_MAX_WIDTH_PX: "400"
```

(`R2_PUBLIC_BASE_URL` only if missing — the code already reads it; verify with `grep R2_PUBLIC_BASE_URL docker-compose.yml`.) Mirror the same four into `docker-compose.test.yml`'s catalogue block.

- [ ] **Step 3: Build and test** — `pnpm turbo build --filter=catalogue && pnpm turbo test --filter=catalogue` → PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/catalogue docker-compose.yml docker-compose.test.yml pnpm-lock.yaml
git commit -m "feat(catalogue): host image-processing module and result consumers in composition root"
```

---

### Task 12: Catalogue — multipart upload endpoints (TDD)

**Files:**
- Modify: `apps/catalogue/src/application/image-storage.ts` (port), `apps/catalogue/src/infrastructure/r2-image-storage.ts` + `.test.ts`
- Modify: `apps/catalogue/src/application/request-image-upload-use-case.ts` + tests in `use-cases.test.ts`
- Create: `apps/catalogue/src/application/complete-multipart-upload-use-case.ts`, `apps/catalogue/src/application/abort-multipart-upload-use-case.ts` (+ tests in `use-cases.test.ts`)
- Modify: the images router (where `upload-url`/`confirm` routes live — grep `upload-url` under `apps/catalogue/src/`), `apps/catalogue/src/main.ts`

**Interfaces:**
- Consumes: `ConfirmImageUploadUseCase.execute(lotId, imageKey, isPrimary)` (Task 9 version — reuse it wholesale for the post-complete step).
- Produces:
  - `ImageStorage` gains: `createMultipartUpload(key: string, contentType: string): Promise<{ uploadId: string }>`, `generatePresignedPartUrl(key: string, uploadId: string, partNumber: number): Promise<string>`, `completeMultipartUpload(key: string, uploadId: string, parts: { partNumber: number; eTag: string }[]): Promise<void>`, `abortMultipartUpload(key: string, uploadId: string): Promise<void>`.
  - `RequestImageUploadUseCase.execute(lotId, contentType, fileSize)` returns `{ kind: 'single'; uploadUrl: string; imageKey: string } | { kind: 'multipart'; uploadId: string; imageKey: string; parts: { partNumber: number; uploadUrl: string }[] }`.
  - Constants in `request-image-upload-use-case.ts`: `MULTIPART_THRESHOLD_BYTES` from `Number(process.env.MULTIPART_THRESHOLD_BYTES ?? 20_971_520)` injected via constructor option, `PART_SIZE_BYTES = 10_485_760`.
  - Routes: `POST /api/lots/:id/images/complete-multipart-upload` (body `{ uploadId: string, imageKey: string, parts: { partNumber: number, eTag: string }[], isPrimary: boolean }`) → 201 with the created image DTO (same response as `confirm`); `POST /api/lots/:id/images/abort-multipart-upload` (body `{ uploadId: string, imageKey: string }`) → `{ data: null }`.

- [ ] **Step 1: Write failing tests**

In `use-cases.test.ts`:

```typescript
it('should_returnSingleUploadUrl_when_fileSizeAtOrBelowThreshold', async () => {
  const result = await requestImageUpload.execute('lot-1', 'image/jpeg', 20_971_520);

  expect(result.kind).toBe('single');
});

it('should_returnMultipartPlanWithCeilDivParts_when_fileSizeAboveThreshold', async () => {
  mockImageStorage.createMultipartUpload.mockResolvedValue({ uploadId: 'up-1' });
  mockImageStorage.generatePresignedPartUrl.mockResolvedValue('https://r2/part');

  const result = await requestImageUpload.execute('lot-1', 'image/jpeg', 25_000_000);

  expect(result).toMatchObject({ kind: 'multipart', uploadId: 'up-1' });
  expect(result.kind === 'multipart' && result.parts).toHaveLength(3); // ceil(25MB / 10MB)
  expect(mockImageStorage.generatePresignedPartUrl).toHaveBeenCalledWith(expect.any(String), 'up-1', 1);
});

it('should_completeUploadThenConfirm_when_completeMultipartCalled', async () => {
  await completeMultipartUpload.execute('lot-1', 'up-1', 'lots/lot-1/k', [{ partNumber: 1, eTag: 'e1' }], false);

  expect(mockImageStorage.completeMultipartUpload).toHaveBeenCalledWith('lots/lot-1/k', 'up-1', [{ partNumber: 1, eTag: 'e1' }]);
  expect(mockConfirmImageUpload.execute).toHaveBeenCalledWith('lot-1', 'lots/lot-1/k', false);
});

it('should_abortUpload_when_abortCalled', async () => {
  await abortMultipartUpload.execute('lots/lot-1/k', 'up-1');

  expect(mockImageStorage.abortMultipartUpload).toHaveBeenCalledWith('lots/lot-1/k', 'up-1');
});
```

R2 adapter test: mock the S3 client (as in Task 4) asserting `CreateMultipartUploadCommand`, `UploadPartCommand` presign (via `getSignedUrl`), `CompleteMultipartUploadCommand` (parts mapped to `{ PartNumber, ETag }`), `AbortMultipartUploadCommand`.

- [ ] **Step 2: Run tests to verify they fail** — FAIL.

- [ ] **Step 3: Implement**

Port additions as in Interfaces. `R2ImageStorage` implements them with `CreateMultipartUploadCommand`, `getSignedUrl(client, new UploadPartCommand({ Bucket, Key, UploadId, PartNumber }), { expiresIn: 3600 })`, `CompleteMultipartUploadCommand({ ..., MultipartUpload: { Parts: parts.map(p => ({ PartNumber: p.partNumber, ETag: p.eTag })) } })`, `AbortMultipartUploadCommand`. `RequestImageUploadUseCase`:

```typescript
const PART_SIZE_BYTES = 10_485_760;

export type RequestImageUploadResult =
  | { kind: 'single'; uploadUrl: string; imageKey: string }
  | { kind: 'multipart'; uploadId: string; imageKey: string; parts: { partNumber: number; uploadUrl: string }[] };

export class RequestImageUploadUseCase {
  constructor(
    private readonly imageStorage: ImageStorage,
    private readonly multipartThresholdBytes: number,
  ) {}

  async execute(lotId: string, contentType: string, fileSize: number): Promise<RequestImageUploadResult> {
    const imageKey = `lots/${lotId}/${uuidv4()}`;
    if (fileSize <= this.multipartThresholdBytes) {
      const uploadUrl = await this.imageStorage.generatePresignedUploadUrl(imageKey, contentType);
      return { kind: 'single', uploadUrl, imageKey };
    }
    const { uploadId } = await this.imageStorage.createMultipartUpload(imageKey, contentType);
    const partCount = Math.ceil(fileSize / PART_SIZE_BYTES);
    const parts = await Promise.all(
      Array.from({ length: partCount }, (_, i) =>
        this.imageStorage.generatePresignedPartUrl(imageKey, uploadId, i + 1).then(uploadUrl => ({ partNumber: i + 1, uploadUrl }))),
    );
    return { kind: 'multipart', uploadId, imageKey, parts };
  }
}
```

`CompleteMultipartUploadUseCase` takes `(imageStorage, confirmImageUpload: ConfirmImageUploadUseCase)`; `execute(lotId, uploadId, imageKey, parts, isPrimary)` calls storage complete then delegates to confirm (which sets `pending` + publishes — no duplication). `AbortMultipartUploadUseCase` wraps `imageStorage.abortMultipartUpload`. Router: the existing upload-url handler passes `body.fileSize` (validate: number, > 0, else 400 `VALIDATION_ERROR`) and returns the discriminated result under `{ data }`; add the two new POST routes with the same `authMiddleware` as upload-url; unknown lot on complete → existing `LotNotFoundError` handling → 404. `main.ts`: `requestImageUpload: new RequestImageUploadUseCase(imageStorage, Number(process.env.MULTIPART_THRESHOLD_BYTES ?? 20_971_520))`, plus the two new use cases. Add `MULTIPART_THRESHOLD_BYTES: "20971520"` to both compose files' catalogue blocks.

- [ ] **Step 4: Run tests** — `pnpm turbo test --filter=catalogue && pnpm turbo build --filter=catalogue` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/catalogue docker-compose.yml docker-compose.test.yml
git commit -m "feat(catalogue): add size-threshold multipart upload endpoints"
```

---

### Task 13: Admin-service — multipart proxies (TDD)

**Files:**
- Modify: `apps/admin/src/presentation/lots-router.ts` + its test file (grep `upload-url` in `apps/admin/src/presentation/*.test.ts` to find where the image proxy tests live)

**Interfaces:**
- Consumes: catalogue endpoints from Task 12; existing proxy helpers `proxy`, `tok`, `auth`, `catalogue` client in `lots-router.ts`.
- Produces: `POST /admin/api/lots/:id/images/complete-multipart-upload`, `POST /admin/api/lots/:id/images/abort-multipart-upload`.

- [ ] **Step 1: Write failing tests** — mirror the existing upload-url proxy test pattern: assert `catalogue.post` is called with `/api/lots/lot-1/images/complete-multipart-upload` (and abort) forwarding body + token.

- [ ] **Step 2: Run to verify failure** — `pnpm turbo test --filter=admin` → FAIL.

- [ ] **Step 3: Implement** — next to the existing upload-url proxy (`lots-router.ts:90`):

```typescript
  r.post('/admin/api/lots/:id/images/complete-multipart-upload', auth, async c =>
    proxy(async () => catalogue.post(`/api/lots/${c.req.param('id')}/images/complete-multipart-upload`, tok(c), await c.req.json()), c));

  r.post('/admin/api/lots/:id/images/abort-multipart-upload', auth, async c =>
    proxy(async () => catalogue.post(`/api/lots/${c.req.param('id')}/images/abort-multipart-upload`, tok(c), await c.req.json()), c));
```

- [ ] **Step 4: Run tests** — PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): proxy multipart upload complete and abort to catalogue"
```

---

### Task 14: Infra — RabbitMQ definitions + ClamAV container

**Files:**
- Modify: `infra/rabbitmq/definitions.json`
- Modify: `docker-compose.yml`, `docker-compose.test.yml`

- [ ] **Step 1: Add queues and bindings**

In `definitions.json`, following the exact JSON shape of existing entries, add to `queues` (same vhost/durable settings as existing):
`catalogue.image.processing`, `catalogue.image.processed`, `catalogue.image.rejected`.
Add to `bindings` (source `carat.events`, same shape as existing):
`("catalogue.image.processing", "lot.image.uploaded")`, `("catalogue.image.processed", "lot.image.processed")`, `("catalogue.image.rejected", "lot.image.rejected")`.
These names must match the code exactly: Task 11 subscribes queues `catalogue.image.processed` / `catalogue.image.rejected` and the module uses queue `catalogue.image.processing` — diff against `main.ts` after Task 11.

- [ ] **Step 2: Add the clamav service to both compose files**

```yaml
  clamav:
    image: clamav/clamav:1.3
    ports:
      - "3310:3310"
    healthcheck:
      test: ["CMD-SHELL", "clamdscan --ping 1 || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 120s
```

and add to catalogue-service `depends_on:` in both files:

```yaml
      clamav:
        condition: service_healthy
```

Note: ClamAV takes 1–3 minutes on first boot to load signatures — hence the generous `start_period`.

- [ ] **Step 3: Validate** — `docker compose config -q && docker compose -f docker-compose.test.yml config -q && python3 -c "import json; json.load(open('infra/rabbitmq/definitions.json'))"` → all exit 0.

- [ ] **Step 4: Commit**

```bash
git add infra/rabbitmq/definitions.json docker-compose.yml docker-compose.test.yml
git commit -m "feat(infra): add image processing queues, bindings and clamav container"
```

---

### Task 15: Admin-portal — processing status UI (TDD)

**Files:**
- Modify: `apps/admin-portal/src/components/image-uploader.tsx` + its co-located test (created by the prerequisite plan)
- Modify: the `_actions.ts` for the lot edit page (grep `getUploadUrl` under `apps/admin-portal/src/app/` — the prerequisite plan places it beside the edit page) and its `LotImage` type import if local

**Interfaces:**
- Consumes: `LotImage` with `processingStatus`/`rejectionReason` (from `@carat-room/shared-types` or the portal's catalogue lib `apps/admin-portal/src/lib/` — match whichever the uploader already imports).
- Produces: rendering rules — `pending`: spinner overlay on the tile (element with `data-testid="image-processing-spinner"`); `rejected`: red badge with the reason text and the tile's delete button still present; `ready`: current rendering. Reason copy: `virus_detected` → `"Virus detected"`, `processing_failed` → `"Processing failed — try re-uploading"`.

- [ ] **Step 1: Write failing component tests**

```tsx
it('should_showSpinnerOverlay_when_imageIsPending', () => {
  render(<ImageUploader lotId="lot-1" images={[buildImage({ processingStatus: 'pending' })]} />);

  expect(screen.getByTestId('image-processing-spinner')).toBeInTheDocument();
});

it('should_showVirusBadgeAndDeleteButton_when_imageRejectedForVirus', () => {
  render(<ImageUploader lotId="lot-1" images={[buildImage({ processingStatus: 'rejected', rejectionReason: 'virus_detected' })]} />);

  expect(screen.getByText('Virus detected')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
});

it('should_showProcessingFailedBadge_when_imageRejectedForProcessingFailure', () => {
  render(<ImageUploader lotId="lot-1" images={[buildImage({ processingStatus: 'rejected', rejectionReason: 'processing_failed' })]} />);

  expect(screen.getByText('Processing failed — try re-uploading')).toBeInTheDocument();
});
```

Extend the file's existing `buildImage` builder with defaults `processingStatus: 'ready', rejectionReason: null`; adapt props to the component's real signature.

- [ ] **Step 2: Run to verify failure** — `pnpm turbo test --filter=admin-portal` → FAIL.

- [ ] **Step 3: Implement**

In the tile rendering, add (Tailwind, match surrounding classes):

```tsx
{image.processingStatus === 'pending' && (
  <div data-testid="image-processing-spinner" className="absolute inset-0 flex items-center justify-center bg-black/40">
    <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
  </div>
)}
{image.processingStatus === 'rejected' && (
  <span className="absolute left-1 top-1 rounded bg-red-600 px-1.5 py-0.5 text-xs text-white">
    {image.rejectionReason === 'virus_detected' ? 'Virus detected' : 'Processing failed — try re-uploading'}
  </span>
)}
```

Rejected tiles keep their existing hover delete button; pending tiles must NOT be draggable for reorder (guard the drag handlers with `image.processingStatus !== 'pending'`). Newly confirmed images arrive from the confirm response with `processingStatus: 'pending'` and transition via the page's existing SWR 5-second polling — no extra plumbing. If the images list rendered by the uploader comes from local state seeded by props, re-sync local state from props when the polled props change (`useEffect` on the images prop) so status transitions surface.

- [ ] **Step 4: Run tests** — PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal
git commit -m "feat(admin-portal): render image processing status with spinner and rejection badges"
```

---

### Task 16: Admin-portal — multipart client upload (TDD)

**Files:**
- Modify: the lot edit `_actions.ts` (same file as Task 15)
- Create: `apps/admin-portal/src/lib/multipart-upload.ts` + `.test.ts`
- Modify: `apps/admin-portal/src/components/image-uploader.tsx`

**Interfaces:**
- Consumes: admin proxies from Task 13; the discriminated upload-url response from Task 12; existing `getUploadUrl`/`confirmImage` actions.
- Produces:
  - `_actions.ts`: `getUploadUrl(lotId, contentType, fileSize)` now forwards `fileSize` and returns the discriminated union `{ kind: 'single'; uploadUrl; imageKey } | { kind: 'multipart'; uploadId; imageKey; parts }`; new `completeMultipartUpload(lotId, uploadId, imageKey, parts, isPrimary)` and `abortMultipartUpload(lotId, uploadId, imageKey)` actions posting to the Task 13 proxies (same fetch-wrapper/envelope conventions as the file's existing actions — check `res.ok` before parsing).
  - `multipart-upload.ts`: `uploadFileInParts(file: File, parts: { partNumber: number; uploadUrl: string }[], options?: { maxConcurrent?: number }): Promise<{ partNumber: number; eTag: string }[]>` — slices the file in 10MB chunks (`PART_SIZE_BYTES = 10_485_760` exported), PUTs each chunk to its URL with at most 3 in flight, collects each response's `ETag` header, throws on any non-ok response or missing ETag.

- [ ] **Step 1: Write failing tests for `uploadFileInParts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadFileInParts, PART_SIZE_BYTES } from './multipart-upload';

const buildFile = (bytes: number): File => new File([new Uint8Array(bytes)], 'big.jpg', { type: 'image/jpeg' });
const parts = (n: number) => Array.from({ length: n }, (_, i) => ({ partNumber: i + 1, uploadUrl: `https://r2/part-${i + 1}` }));

describe('uploadFileInParts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ ETag: '"etag-x"' }) }));
  });

  it('should_putEachSliceAndCollectETags_when_allPartsSucceed', async () => {
    const result = await uploadFileInParts(buildFile(PART_SIZE_BYTES * 2 + 5), parts(3));

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual([
      { partNumber: 1, eTag: '"etag-x"' },
      { partNumber: 2, eTag: '"etag-x"' },
      { partNumber: 3, eTag: '"etag-x"' },
    ]);
  });

  it('should_throw_when_anyPartFails', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, headers: new Headers({ ETag: '"e"' }) })
      .mockResolvedValueOnce({ ok: false, status: 500, headers: new Headers() });

    await expect(uploadFileInParts(buildFile(PART_SIZE_BYTES * 2), parts(2))).rejects.toThrow();
  });

  it('should_limitConcurrency_when_manyParts', async () => {
    let inFlight = 0; let peak = 0;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      inFlight += 1; peak = Math.max(peak, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight -= 1;
      return { ok: true, headers: new Headers({ ETag: '"e"' }) };
    });

    await uploadFileInParts(buildFile(PART_SIZE_BYTES * 6), parts(7), { maxConcurrent: 3 });

    expect(peak).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

```typescript
export const PART_SIZE_BYTES = 10_485_760;

interface PartUrl { partNumber: number; uploadUrl: string }
interface UploadedPart { partNumber: number; eTag: string }

export async function uploadFileInParts(
  file: File,
  parts: PartUrl[],
  options: { maxConcurrent?: number } = {},
): Promise<UploadedPart[]> {
  const maxConcurrent = options.maxConcurrent ?? 3;
  const results: UploadedPart[] = [];
  const queue = [...parts];

  const uploadNext = async (): Promise<void> => {
    const part = queue.shift();
    if (!part) return;
    const start = (part.partNumber - 1) * PART_SIZE_BYTES;
    const chunk = file.slice(start, start + PART_SIZE_BYTES);
    const res = await fetch(part.uploadUrl, { method: 'PUT', body: chunk });
    if (!res.ok) {
      throw new Error(`Part ${part.partNumber} upload failed with status ${res.status}`);
    }
    const eTag = res.headers.get('ETag');
    if (!eTag) {
      throw new Error(`Part ${part.partNumber} response is missing an ETag header`);
    }
    results.push({ partNumber: part.partNumber, eTag });
    await uploadNext();
  };

  await Promise.all(Array.from({ length: Math.min(maxConcurrent, parts.length) }, () => uploadNext()));
  return results.sort((a, b) => a.partNumber - b.partNumber);
}
```

Then in `image-uploader.tsx`'s per-file upload flow, replace the single-path flow with:

```typescript
const plan = await getUploadUrl(lotId, file.type, file.size);
if (plan.kind === 'single') {
  const putRes = await fetch(plan.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  if (!putRes.ok) throw new Error('Image upload failed');
  const image = await confirmImage(lotId, plan.imageKey, isFirstImage);
  appendImage(image);
} else {
  try {
    const uploadedParts = await uploadFileInParts(file, plan.parts);
    const image = await completeMultipartUpload(lotId, plan.uploadId, plan.imageKey, uploadedParts, isFirstImage);
    appendImage(image);
  } catch (err) {
    await abortMultipartUpload(lotId, plan.uploadId, plan.imageKey);
    throw err;
  }
}
```

(Adapt `appendImage`/`isFirstImage`/inline-error handling to the component's existing structure — the surrounding try/catch that shows the inline upload error must wrap both branches.) Update `_actions.ts` per the Interfaces block, matching the existing actions' fetch-wrapper and `{ data }` envelope handling. Add a component test: mock the actions module, upload a file larger than the threshold, assert `completeMultipartUpload` is called and on part failure `abortMultipartUpload` is called and an inline error is shown.

- [ ] **Step 4: Run tests** — `pnpm turbo test --filter=admin-portal && pnpm turbo build --filter=admin-portal` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-portal
git commit -m "feat(admin-portal): add threshold-based multipart image upload with abort on failure"
```

---

### Task 17: Full build, lint, manual verification

- [ ] **Step 1: Full pipeline** — `pnpm turbo build && pnpm lint && pnpm turbo test` → all PASS.

- [ ] **Step 2: Boot the stack** — `docker compose up -d` (wait for clamav healthy — first boot downloads signatures, allow ~3 minutes), then run catalogue + admin services and the admin-portal dev servers per CLAUDE.md.

- [ ] **Step 3: Manual verification in a real browser** (all five are REQUIRED; per the spec's Testing section):

1. Upload a normal-size image on `/admin/lots/[id]` → tile shows spinner → transitions to ready with a visibly resized thumbnail within a few 5s poll cycles.
2. Upload the EICAR test file renamed to `.jpg` (create with: `printf 'X5O!P%%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > eicar.jpg`) → tile shows red "Virus detected" badge; delete it via its delete button.
3. `docker compose stop clamav`, upload an image → after ~3 backoff retries the tile shows "Processing failed — try re-uploading". `docker compose start clamav`.
4. Upload a file > 20MB (generate: `dd if=/dev/urandom of=big.jpg bs=1m count=25` — note it must still be a decodable image for the thumbnail step; instead use a large real photo or `sharp` to generate one) → completes, appears, **refresh the page** → still there and eventually ready.
5. Kill the network mid-multipart-upload (browser devtools → offline) → inline error appears; check R2/logs that abort was called (no dangling multipart upload).

- [ ] **Step 4: Mark plan checkboxes and update session summary**

Update this plan's checkboxes; add an entry to `docs/superpowers/SESSION-SUMMARY.md`.

- [ ] **Step 5: Final commit**

```bash
git add docs/superpowers
git commit -m "chore: mark lot image processing pipeline plan complete"
```

---

## Spec coverage map

| Spec section | Task(s) |
|---|---|
| Package layering + ports + value objects | 2 |
| ProcessUploadedImageUseCase + config-driven no-ops | 3 |
| Sharp / ClamAV / S3-compatible adapters | 4 |
| RabbitMqEventBus retry/backoff + processing_failed | 5 |
| createImageProcessingModule + start flow | 6 |
| Adapter swap guarantee (Kafka, AWS S3 PoCs) | 7 |
| LotImage processingStatus/rejectionReason + DTO | 1, 8 |
| Confirm publishes lot.image.uploaded, pending | 9 |
| Catalogue processed/rejected consumer, no-op on missing | 10 |
| Host wiring in composition root + env vars | 11 |
| Multipart endpoints + threshold + abort | 12 |
| Admin-service proxies | 13 |
| definitions.json + clamav container | 14 |
| Pending spinner / rejected badge UI | 15 |
| Multipart client + abort-on-failure | 16 |
| Manual verification (5 scenarios) | 17 |
| Error handling: virus original not auto-deleted | 10 (no delete call), 15 (manual delete stays) |
| Out of scope items | excluded throughout |

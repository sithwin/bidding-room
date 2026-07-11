# Lot Image Management — Design

**Date:** 2026-07-10
**Status:** Approved

## Problem

The Lot edit page (`/admin/lots/[id]`) already has image UI (`ImageUploader` component) and admin-service proxy routes for upload/delete/reorder, but the whole chain is broken:

1. **Upload never actually saves.** The frontend calls `POST /api/lots/:id/images/upload-url`, PUTs the file to the returned presigned R2 URL, then stops. It never calls `POST /api/lots/:id/images/confirm` — the endpoint that actually creates the `LotImage` record on the lot. The file lands in R2, but the lot never learns about it.
2. **Contract mismatch on the upload-url response.** The frontend destructures `{ uploadUrl, imageId, publicUrl }`; the catalogue endpoint actually returns `{ uploadUrl, imageKey }`. `imageId` and `publicUrl` are `undefined` — the row shown after "upload" is fabricated client state that disappears on refresh.
3. **Existing images can't render either.** The frontend reads `img.publicUrl`; catalogue's `LotImage` serializes as `url`. Every `<img>` tag for a real, already-saved image is broken today.
4. **Delete and reorder are dead ends.** `DELETE /api/lots/:id/images/:imageId` and `PATCH /api/lots/:id/images/reorder` don't exist in the catalogue service at all — same missing-endpoint pattern as the lot-edit bug found in the status/category spec. The admin-service proxy (`lots-router.ts`) also has no proxy route for `confirm` at all.

This spec fixes the full chain — upload, confirm, delete, reorder — end to end, and rebuilds the UI as the grid-with-hover-controls layout already approved during brainstorming, adding drag-and-drop for both reordering and desktop file drops.

## Data model change

`LotImage` (`apps/catalogue/src/domain/lot.ts`) gains a `key: string` field — the raw R2 object key, stored at confirm time. Needed so delete can remove the correct R2 objects without parsing them back out of a public URL. `key` is an internal field: catalogue's presentation layer must map `Lot`/`LotImage` to a response DTO that excludes `key` before returning JSON — routes currently serialize the raw domain object directly (`c.json({ data: lot })`), which would otherwise leak it.

## Catalogue service changes

- `ImageStorage` port (`application/image-storage.ts`) gains `deleteObject(key: string): Promise<void>`.
- `R2ImageStorage` implements it with `DeleteObjectCommand`.
- **New `DeleteImageUseCase`**: load the lot, find the image by id (404 if not found), delete both `key` and `${key}_thumb` from storage, remove it from `lot.images`, and if the deleted image was `isPrimary`, auto-promote the remaining image with the lowest `displayOrder` to primary (if any remain). Renumber remaining images' `displayOrder` to close the gap (0..n-1). Save the lot.
- **New `ReorderImagesUseCase`**: given an ordered list of image ids, validate the set matches the lot's current image ids exactly (400 if not — e.g. stale client state, wrong lot), then reassign `displayOrder` to match the given order. Save the lot.
- **New router routes**: `DELETE /api/lots/:id/images/:imageId`, `PATCH /api/lots/:id/images/reorder` (body `{ imageIds: string[] }`).
- `confirm-image-upload-use-case.ts` stores the `key` (already has it as `imageKey`) on the new `LotImage`.
- `GET /api/lots` / `GET /api/lots/:id` responses map each `LotImage` to `{ id, url, thumbnailUrl, displayOrder, isPrimary }` — `key` excluded, matching what the frontend already expects field-name-wise (`url`, not `publicUrl` — the frontend is the one that needs to change its field name).

## Admin-service changes

`apps/admin/src/presentation/lots-router.ts`: add the missing proxy route `POST /admin/api/lots/:id/images/confirm` (forwards to catalogue's existing `confirm` endpoint, currently has no proxy at all). Existing `upload-url`, `images/:imageId` delete, and `images/reorder` proxies stay as-is — they were already pointed correctly, just at endpoints that didn't exist downstream.

## Admin-portal changes

- `_actions.ts`: 
  - `getUploadUrl` drops the unused `filename` parameter (the backend never reads it — dead param) and returns `{ uploadUrl, imageKey }` matching the real contract.
  - New `confirmImage(lotId, imageKey, isPrimary)` action calling the new confirm proxy, returning the created `LotImage` (`{ id, url, thumbnailUrl, displayOrder, isPrimary }`) so the UI can update state directly without a full page reload.
  - `deleteImage`/`reorderImages` stay as-is (contracts were already correct; only the downstream endpoints were missing).
- `image-uploader.tsx` rewritten as the grid-with-hover-controls layout (Option A, approved in brainstorming):
  - Thumbnails in a responsive grid; on hover, show a primary badge (if primary), a delete `×`, and a drag handle.
  - Upload: a `+` tile that (a) opens a native multi-file picker on click, and (b) accepts files dragged directly from the desktop onto the grid. No maximum image count.
  - Upload flow per file: `getUploadUrl` → `PUT` to R2 → `confirmImage` (first image on the lot becomes primary automatically, matching existing `confirm-image-upload-use-case` behavior) → append the returned image to local state.
  - Reordering: native HTML5 drag-and-drop between grid thumbnails (no new dependency) — on drop, call `reorderImages` with the new id order.
  - Deleting the primary image: after a successful delete, just refetch/replace local state from the response — the backend already computed the new primary via auto-promotion; the frontend must not duplicate that logic.
  - Field names corrected to `url`/`thumbnailUrl` (matching the real catalogue contract) instead of the nonexistent `publicUrl`.

## Error handling

- R2 `PUT` fails → show an inline error, `confirm` is never called (no orphaned lot record).
- `confirm` fails after a successful R2 `PUT` → inline error shown to the admin; the R2 object is orphaned. No cleanup job is in scope for this spec (see Out of scope).
- Delete with an unknown `imageId` → `404`.
- Reorder with an id set that doesn't match the lot's current images exactly → `400`.

## Testing

- Catalogue: unit tests for `DeleteImageUseCase` (delete non-primary; delete primary → auto-promote lowest `displayOrder`; delete the last image → no primary left; `displayOrder` renumbering; storage called to delete both `key` and `${key}_thumb`) and `ReorderImagesUseCase` (valid reorder; rejected on id-set mismatch). Router tests for both new routes. `R2ImageStorage` delete test.
- Admin-service: `lots-router` test for the new `confirm` proxy route.
- Admin-portal: component tests for the rewritten image manager — upload triggers the request→PUT→confirm sequence and appends the real returned image; delete removes the right item; drag-and-drop reorder calls `reorderImages` with the new order.
- Manual verification (required before this is done, per the standing "drive it in a real browser" lesson): upload two images via the file picker, upload one via desktop drag-and-drop, drag to reorder, delete the primary image and confirm auto-promotion, then **refresh the page** and confirm the images are still there — this last step is the one that would have caught the original bug, since the broken version "worked" until refresh.

## Out of scope

- Real thumbnail generation. `${key}_thumb` remains a URL convention with no actual resize pipeline — pre-existing gap, unrelated to this fix.
- A cleanup job for R2 objects orphaned by a failed `confirm` call.
- Image editing (crop/rotate) — upload/delete/reorder only.

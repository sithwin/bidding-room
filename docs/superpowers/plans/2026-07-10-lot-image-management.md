# Lot Image Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the fully-broken lot image upload/delete/reorder chain (uploads never persist past a page refresh, existing images don't render, delete/reorder have no backend routes) and rebuild the edit-page UI as a grid with hover controls and drag-and-drop.

**Architecture:** `LotImage` gains a `key` field so delete can target the right R2 objects. Catalogue gets `DeleteImageUseCase`/`ReorderImagesUseCase` following the existing `ConfirmImageUploadUseCase` pattern (load the lot, mutate its `images` array, save the whole lot). Admin-service gets the one missing proxy route (`confirm`). Admin-portal's `ImageUploader` is rewritten to actually call `confirm` after upload and to use the real `url`/`thumbnailUrl` field names instead of a `publicUrl` field that was never real.

**Tech Stack:** Hono + `@aws-sdk/client-s3` (catalogue), Hono (admin-service), Next.js Server Actions + native HTML5 drag-and-drop (admin-portal, no new dependency), Vitest, `@testing-library/react`.

**Plan dependency:** This plan assumes `docs/superpowers/plans/2026-07-10-lot-status-category.md` has already been executed (specifically its Task 3, which adds `Lot.status`) — several `Lot` reconstructions below pass `status: lot.status` through unchanged, which only compiles once that field exists. If running this plan standalone before that one, drop the `status: lot.status` line from the `Lot` reconstructions in Tasks 6 and 7 below (the field defaults to `'ACTIVE'` on its own).

## Global Constraints

- British English in all comments/copy.
- Named exports only, no `export default` (except Next.js page components).
- TypeScript strict mode, no `any`, no `@ts-ignore`.
- Single quotes for string literals.
- Boolean vars use `is`/`has`/`can`/`should`/`was`/`will` prefixes.
- Test files co-located, named `<file>.test.ts`.
- SQL only in `infrastructure/`. Domain/application layers never import Hono, pg, `@aws-sdk/client-s3`, or `amqplib`.
- `LotImage.key` (the raw R2 object key) must never appear in any JSON response — it is stripped by an explicit response mapper, not relied on to be "just missing" from a schema.
- Any migration must be mirrored into `tests/db-init/init.sql` in the same task.

---

### Task 1: Migration — add `lot_images.key`

**Files:**
- Create: `apps/catalogue/migrations/004_add_lot_image_key.sql`
- Modify: `tests/db-init/init.sql`

**Interfaces:**
- Produces: `lot_images.key` column, `NOT NULL DEFAULT ''` (existing rows get an empty key; they predate this feature and were never actually persisted correctly — see plan Task 2 note). Consumed by Task 3.

- [ ] **Step 1: Write the migration**

Create `apps/catalogue/migrations/004_add_lot_image_key.sql`:

```sql
-- Raw R2 object key per image, needed so DeleteImageUseCase can remove the
-- correct objects from storage without parsing them back out of a public URL.
ALTER TABLE lot_images
  ADD COLUMN IF NOT EXISTS key TEXT NOT NULL DEFAULT '';
```

- [ ] **Step 2: Mirror into the test DB bootstrap**

In `tests/db-init/init.sql`, immediately after the `lots.status` block added by the lot-status-category plan (search for `-- Migration 003: lot status`), add:

```sql
-- Migration 004: lot image key (mirrors apps/catalogue/migrations/004)
ALTER TABLE lot_images
  ADD COLUMN IF NOT EXISTS key TEXT NOT NULL DEFAULT '';
```

(If the lot-status-category plan has not been run yet, add this block right after the `lot_images_lot_id_idx` index instead — order relative to migration 003 does not matter, only that it comes after the `lot_images` table is created.)

- [ ] **Step 3: Verify the migration applies cleanly**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: existing suite still passes (catalogue's `vitest.global-setup.ts` applies every file in `apps/catalogue/migrations/` — a syntax error here fails every catalogue test at setup).

- [ ] **Step 4: Commit**

```bash
git add apps/catalogue/migrations/004_add_lot_image_key.sql tests/db-init/init.sql
git commit -m "feat(catalogue): add lot_images.key column migration"
```

---

### Task 2: Domain and repository support for `LotImage.key`

**Files:**
- Modify: `apps/catalogue/src/domain/lot.ts`
- Modify: `apps/catalogue/src/infrastructure/postgres-lot-repository.ts`
- Modify: `apps/catalogue/src/infrastructure/postgres-lot-repository.test.ts`

**Interfaces:**
- Consumes: `lot_images.key` column (Task 1).
- Produces: `LotImage.key: string`, persisted and read back by `PostgresLotRepository`. Consumed by Task 4 (confirm), Task 6 (delete).

- [ ] **Step 1: Write the failing test**

In `apps/catalogue/src/infrastructure/postgres-lot-repository.test.ts`, update the existing `'should_saveThenFindById_when_lotHasImages'` test's `images` array to add `key: 'lots/lot-1/a'` to the one image object. Then add a new assertion at the end of that same test:

```ts
    expect(found!.images[0].key).toBe('lots/lot-1/a');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: FAIL — `LotImage` doesn't have a `key` property yet (TS error), and `found!.images[0].key` is `undefined`.

- [ ] **Step 3: Add `key` to the `LotImage` domain type**

In `apps/catalogue/src/domain/lot.ts`, add to `LotImage`:

```ts
  key: string;
```

after `id: string;` (so it reads `id`, `lotId`, `key`, `url`, ... — order doesn't matter functionally, but keep `key` near the top since it's the storage-layer identity).

- [ ] **Step 4: Persist `key` in the repository**

In `apps/catalogue/src/infrastructure/postgres-lot-repository.ts`:

Add `key: string;` to `LotImageRow` (after `lot_id: string;`).

In `rowToLotImage`, add `key: row.key,` after `lotId: row.lot_id,`.

In `fetchImages`, update the SELECT:

```ts
  const rows = await db<LotImageRow[]>`
    SELECT id, lot_id, key, url, thumbnail_url, display_order, is_primary
    FROM lot_images WHERE lot_id = ${lotId}
    ORDER BY display_order ASC
  `;
```

In `findAll`'s image-batch SELECT, make the same change:

```ts
    const imageRows = await this.db<LotImageRow[]>`
      SELECT id, lot_id, key, url, thumbnail_url, display_order, is_primary
      FROM lot_images WHERE lot_id IN ${this.db(lotIds)}
      ORDER BY lot_id, display_order ASC
    `;
```

In `save`, update the per-image INSERT:

```ts
        await sql`
          INSERT INTO lot_images (id, lot_id, key, url, thumbnail_url, display_order, is_primary)
          VALUES (${img.id}, ${img.lotId}, ${img.key}, ${img.url}, ${img.thumbnailUrl}, ${img.displayOrder}, ${img.isPrimary})
        `;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/catalogue/src/domain/lot.ts apps/catalogue/src/infrastructure/postgres-lot-repository.ts apps/catalogue/src/infrastructure/postgres-lot-repository.test.ts
git commit -m "feat(catalogue): persist raw R2 key on lot images"
```

---

### Task 3: `ImageStorage.deleteObject` port and R2 implementation

**Files:**
- Modify: `apps/catalogue/src/application/image-storage.ts`
- Modify: `apps/catalogue/src/infrastructure/r2-image-storage.ts`
- Modify: `apps/catalogue/src/infrastructure/r2-image-storage.test.ts`

**Interfaces:**
- Produces: `ImageStorage.deleteObject(key: string): Promise<void>`. Consumed by Task 6 (`DeleteImageUseCase`).

- [ ] **Step 1: Write the failing test**

In `apps/catalogue/src/infrastructure/r2-image-storage.test.ts`, add after the existing `'should_returnPublicUrl_when_getPublicUrl'` test:

```ts
  it('should_notThrow_when_deleteObjectCalled', async () => {
    await expect(storage.deleteObject('lots/lot-1/img-1')).resolves.toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: FAIL — `storage.deleteObject` doesn't exist (TS error).

- [ ] **Step 3: Add `deleteObject` to the port and implementation**

In `apps/catalogue/src/application/image-storage.ts`, add to the `ImageStorage` interface:

```ts
  deleteObject(key: string): Promise<void>;
```

In `apps/catalogue/src/infrastructure/r2-image-storage.ts`, add `DeleteObjectCommand` to the import:

```ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
```

Add the method to `R2ImageStorage`, after `getPublicUrl`:

```ts
  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: PASS. Note this test hits a real (test-configured) R2/S3-compatible endpoint the same way the existing `generatePresignedUploadUrl`/`getPublicUrl` tests do — if those already pass in this environment, this will too; `DeleteObjectCommand` against a nonexistent key does not error on S3-compatible APIs.

- [ ] **Step 5: Commit**

```bash
git add apps/catalogue/src/application/image-storage.ts apps/catalogue/src/infrastructure/r2-image-storage.ts apps/catalogue/src/infrastructure/r2-image-storage.test.ts
git commit -m "feat(catalogue): add ImageStorage.deleteObject"
```

---

### Task 4: `ConfirmImageUploadUseCase` stores the `key`

**Files:**
- Modify: `apps/catalogue/src/application/confirm-image-upload-use-case.ts`
- Modify: `apps/catalogue/src/application/use-cases.test.ts`

**Interfaces:**
- Consumes: `LotImage.key` (Task 2).
- Produces: every `LotImage` created by this use case now has `key` set to the `imageKey` it was confirmed with.

- [ ] **Step 1: Write the failing test**

In `apps/catalogue/src/application/use-cases.test.ts`, add a new assertion to the existing `'should_appendImage_without_changingExistingImages_when_isPrimaryIsFalse'` test in `describe('ConfirmImageUploadUseCase', ...)`, right after `expect(savedLot.images[0].isPrimary).toBe(false);`:

```ts
    expect(savedLot.images[0].key).toBe('lots/lot-1/img');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: FAIL — `savedLot.images[0].key` is `undefined`.

- [ ] **Step 3: Store the key**

In `apps/catalogue/src/application/confirm-image-upload-use-case.ts`, add `key: imageKey,` to the `newImage` object, after `id: uuidv4(),`:

```ts
    const newImage: LotImage = {
      id: uuidv4(),
      key: imageKey,
      lotId,
      url,
      thumbnailUrl,
      displayOrder: lot.images.length,
      isPrimary,
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/catalogue/src/application/confirm-image-upload-use-case.ts apps/catalogue/src/application/use-cases.test.ts
git commit -m "feat(catalogue): store R2 key when confirming an image upload"
```

---

### Task 5: Domain errors for delete/reorder

**Files:**
- Modify: `apps/catalogue/src/domain/errors.ts`

**Interfaces:**
- Produces: `LotImageNotFoundError`, `ImageOrderMismatchError` — both extend `Error`, matching the existing style of every other error class in this file. Consumed by Tasks 6 and 7.

- [ ] **Step 1: Add the error classes**

In `apps/catalogue/src/domain/errors.ts`, add at the end of the file:

```ts
export class LotImageNotFoundError extends Error {
  constructor(imageId: string) {
    super(`Lot image not found: ${imageId}`);
    this.name = 'LotImageNotFoundError';
  }
}

export class ImageOrderMismatchError extends Error {
  constructor(lotId: string) {
    super(`Reorder request does not match the lot's current images: ${lotId}`);
    this.name = 'ImageOrderMismatchError';
  }
}
```

There is no dedicated test file for `errors.ts` (each error class is exercised via the use case that throws it, in Tasks 6 and 7) — this matches the existing convention (`LotNotFoundError` etc. have no standalone test either).

- [ ] **Step 2: Type-check**

Run: `pnpm turbo build --filter=@carat-room/catalogue`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/catalogue/src/domain/errors.ts
git commit -m "feat(catalogue): add LotImageNotFoundError and ImageOrderMismatchError"
```

---

### Task 6: `DeleteImageUseCase`

**Files:**
- Create: `apps/catalogue/src/application/delete-image-use-case.ts`
- Modify: `apps/catalogue/src/application/use-cases.test.ts`

**Interfaces:**
- Consumes: `LotRepository` (existing), `ImageStorage.deleteObject` (Task 3), `LotNotFoundError`/`LotImageNotFoundError` (Task 5).
- Produces: `DeleteImageUseCase.execute(lotId: string, imageId: string): Promise<void>`. Deletes both R2 objects for the image, removes it from `lot.images`, renumbers remaining `displayOrder` to `0..n-1`, and promotes the new-lowest-`displayOrder` remaining image to `isPrimary` if the deleted image was primary. Consumed by Task 8 (router).

- [ ] **Step 1: Write the failing tests**

In `apps/catalogue/src/application/use-cases.test.ts`, add a helper and a new `describe` block after `describe('ConfirmImageUploadUseCase', ...)`:

```ts
function buildLotWithImages(images: LotImage[]): Lot {
  return new Lot({
    id: 'lot-1',
    title: 'Cartier Love Ring',
    description: null,
    categoryId: 'cat-1',
    condition: LotCondition.Excellent,
    estimatedValue: 3000,
    images,
    createdBy: null,
    createdAt: new Date('2026-06-20T00:00:00Z'),
    updatedAt: new Date('2026-06-20T00:00:00Z'),
  });
}

describe('DeleteImageUseCase', () => {
  it('should_throw_when_lotDoesNotExist', async () => {
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(null), findAll: vi.fn(), save: vi.fn() };
    const mockStorage: ImageStorage = { generatePresignedUploadUrl: vi.fn(), getPublicUrl: vi.fn(), deleteObject: vi.fn() };

    await expect(new DeleteImageUseCase(mockRepo, mockStorage).execute('nonexistent', 'img-1'))
      .rejects.toThrow(LotNotFoundError);
  });

  it('should_throw_when_imageDoesNotExistOnLot', async () => {
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(buildLotWithImages([])), findAll: vi.fn(), save: vi.fn() };
    const mockStorage: ImageStorage = { generatePresignedUploadUrl: vi.fn(), getPublicUrl: vi.fn(), deleteObject: vi.fn() };

    await expect(new DeleteImageUseCase(mockRepo, mockStorage).execute('lot-1', 'nonexistent'))
      .rejects.toThrow(LotImageNotFoundError);
  });

  it('should_deleteBothOriginalAndThumbnailObjects_when_imageDeleted', async () => {
    const images: LotImage[] = [
      { id: 'img-1', lotId: 'lot-1', key: 'lots/lot-1/a', url: 'https://a', thumbnailUrl: 'https://a_thumb', displayOrder: 0, isPrimary: false },
    ];
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(buildLotWithImages(images)), findAll: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };
    const mockStorage: ImageStorage = { generatePresignedUploadUrl: vi.fn(), getPublicUrl: vi.fn(), deleteObject: vi.fn().mockResolvedValue(undefined) };

    await new DeleteImageUseCase(mockRepo, mockStorage).execute('lot-1', 'img-1');

    expect(mockStorage.deleteObject).toHaveBeenCalledWith('lots/lot-1/a');
    expect(mockStorage.deleteObject).toHaveBeenCalledWith('lots/lot-1/a_thumb');
  });

  it('should_promoteLowestDisplayOrderRemaining_when_primaryImageDeleted', async () => {
    const images: LotImage[] = [
      { id: 'img-1', lotId: 'lot-1', key: 'lots/lot-1/a', url: 'https://a', thumbnailUrl: 'https://a_thumb', displayOrder: 0, isPrimary: true },
      { id: 'img-2', lotId: 'lot-1', key: 'lots/lot-1/b', url: 'https://b', thumbnailUrl: 'https://b_thumb', displayOrder: 1, isPrimary: false },
      { id: 'img-3', lotId: 'lot-1', key: 'lots/lot-1/c', url: 'https://c', thumbnailUrl: 'https://c_thumb', displayOrder: 2, isPrimary: false },
    ];
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(buildLotWithImages(images)), findAll: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };
    const mockStorage: ImageStorage = { generatePresignedUploadUrl: vi.fn(), getPublicUrl: vi.fn(), deleteObject: vi.fn().mockResolvedValue(undefined) };

    await new DeleteImageUseCase(mockRepo, mockStorage).execute('lot-1', 'img-1');

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.images).toHaveLength(2);
    expect(savedLot.images.find(img => img.id === 'img-2')?.isPrimary).toBe(true);
    expect(savedLot.images.map(img => img.displayOrder)).toEqual([0, 1]);
  });

  it('should_leaveNoPrimary_when_lastImageDeleted', async () => {
    const images: LotImage[] = [
      { id: 'img-1', lotId: 'lot-1', key: 'lots/lot-1/a', url: 'https://a', thumbnailUrl: 'https://a_thumb', displayOrder: 0, isPrimary: true },
    ];
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(buildLotWithImages(images)), findAll: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };
    const mockStorage: ImageStorage = { generatePresignedUploadUrl: vi.fn(), getPublicUrl: vi.fn(), deleteObject: vi.fn().mockResolvedValue(undefined) };

    await new DeleteImageUseCase(mockRepo, mockStorage).execute('lot-1', 'img-1');

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.images).toHaveLength(0);
  });

  it('should_notChangePrimary_when_nonPrimaryImageDeleted', async () => {
    const images: LotImage[] = [
      { id: 'img-1', lotId: 'lot-1', key: 'lots/lot-1/a', url: 'https://a', thumbnailUrl: 'https://a_thumb', displayOrder: 0, isPrimary: true },
      { id: 'img-2', lotId: 'lot-1', key: 'lots/lot-1/b', url: 'https://b', thumbnailUrl: 'https://b_thumb', displayOrder: 1, isPrimary: false },
    ];
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(buildLotWithImages(images)), findAll: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };
    const mockStorage: ImageStorage = { generatePresignedUploadUrl: vi.fn(), getPublicUrl: vi.fn(), deleteObject: vi.fn().mockResolvedValue(undefined) };

    await new DeleteImageUseCase(mockRepo, mockStorage).execute('lot-1', 'img-2');

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.images.find(img => img.id === 'img-1')?.isPrimary).toBe(true);
  });
});
```

Add these imports to the top of the file: `import { DeleteImageUseCase } from './delete-image-use-case';` and add `LotImageNotFoundError` to the existing `import { CategoryHasLotsError, CategoryNotFoundError, CategorySlugConflictError } from '../domain/errors';` line, plus `import { LotImage } from '../domain/lot';` if `LotImage` is not already imported (check the existing `import { Lot, LotCondition } from '../domain/lot';` line and extend it to `import { Lot, LotCondition, LotImage } from '../domain/lot';`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: FAIL — `delete-image-use-case.ts` doesn't exist.

- [ ] **Step 3: Write `DeleteImageUseCase`**

Create `apps/catalogue/src/application/delete-image-use-case.ts`:

```ts
import { Lot } from '../domain/lot';
import { LotRepository } from '../domain/lot-repository';
import { LotNotFoundError, LotImageNotFoundError } from '../domain/errors';
import { ImageStorage } from './image-storage';

export class DeleteImageUseCase {
  constructor(
    private readonly lotRepository: LotRepository,
    private readonly imageStorage: ImageStorage,
  ) {}

  async execute(lotId: string, imageId: string): Promise<void> {
    const lot = await this.lotRepository.findById(lotId);
    if (!lot) {
      throw new LotNotFoundError(lotId);
    }

    const image = lot.images.find(img => img.id === imageId);
    if (!image) {
      throw new LotImageNotFoundError(imageId);
    }

    await this.imageStorage.deleteObject(image.key);
    await this.imageStorage.deleteObject(`${image.key}_thumb`);

    const remaining = lot.images
      .filter(img => img.id !== imageId)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((img, index) => ({ ...img, displayOrder: index }));

    if (image.isPrimary && remaining.length > 0) {
      remaining[0] = { ...remaining[0], isPrimary: true };
    }

    const updatedLot = new Lot({
      id: lot.id,
      title: lot.title,
      description: lot.description,
      auctionId: lot.auctionId,
      categoryId: lot.categoryId,
      condition: lot.condition,
      estimatedValue: lot.estimatedValue,
      status: lot.status,
      images: remaining,
      createdBy: lot.createdBy,
      createdAt: lot.createdAt,
      updatedAt: new Date(),
    });

    await this.lotRepository.save(updatedLot);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: PASS for all six new tests.

- [ ] **Step 5: Commit**

```bash
git add apps/catalogue/src/application/delete-image-use-case.ts apps/catalogue/src/application/use-cases.test.ts
git commit -m "feat(catalogue): add DeleteImageUseCase with primary auto-promotion"
```

---

### Task 7: `ReorderImagesUseCase`

**Files:**
- Create: `apps/catalogue/src/application/reorder-images-use-case.ts`
- Modify: `apps/catalogue/src/application/use-cases.test.ts`

**Interfaces:**
- Consumes: `LotRepository`, `LotNotFoundError`/`ImageOrderMismatchError` (Task 5).
- Produces: `ReorderImagesUseCase.execute(lotId: string, imageIds: string[]): Promise<void>`. Reassigns `displayOrder` to match the given order. Throws `ImageOrderMismatchError` if `imageIds` doesn't contain exactly the lot's current image ids. Consumed by Task 8 (router).

- [ ] **Step 1: Write the failing tests**

In `apps/catalogue/src/application/use-cases.test.ts`, add a new `describe` block after `describe('DeleteImageUseCase', ...)`:

```ts
describe('ReorderImagesUseCase', () => {
  it('should_throw_when_lotDoesNotExist', async () => {
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(null), findAll: vi.fn(), save: vi.fn() };

    await expect(new ReorderImagesUseCase(mockRepo).execute('nonexistent', ['img-1']))
      .rejects.toThrow(LotNotFoundError);
  });

  it('should_throw_when_imageIdsDoNotMatchLotsCurrentImages', async () => {
    const images: LotImage[] = [
      { id: 'img-1', lotId: 'lot-1', key: 'lots/lot-1/a', url: 'https://a', thumbnailUrl: 'https://a_thumb', displayOrder: 0, isPrimary: true },
      { id: 'img-2', lotId: 'lot-1', key: 'lots/lot-1/b', url: 'https://b', thumbnailUrl: 'https://b_thumb', displayOrder: 1, isPrimary: false },
    ];
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(buildLotWithImages(images)), findAll: vi.fn(), save: vi.fn() };

    await expect(new ReorderImagesUseCase(mockRepo).execute('lot-1', ['img-1', 'img-nonexistent']))
      .rejects.toThrow(ImageOrderMismatchError);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('should_reassignDisplayOrder_when_validReorderGiven', async () => {
    const images: LotImage[] = [
      { id: 'img-1', lotId: 'lot-1', key: 'lots/lot-1/a', url: 'https://a', thumbnailUrl: 'https://a_thumb', displayOrder: 0, isPrimary: true },
      { id: 'img-2', lotId: 'lot-1', key: 'lots/lot-1/b', url: 'https://b', thumbnailUrl: 'https://b_thumb', displayOrder: 1, isPrimary: false },
    ];
    const mockRepo: LotRepository = { findById: vi.fn().mockResolvedValue(buildLotWithImages(images)), findAll: vi.fn(), save: vi.fn().mockResolvedValue(undefined) };

    await new ReorderImagesUseCase(mockRepo).execute('lot-1', ['img-2', 'img-1']);

    const savedLot = (mockRepo.save as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lot;
    expect(savedLot.images.find(img => img.id === 'img-2')?.displayOrder).toBe(0);
    expect(savedLot.images.find(img => img.id === 'img-1')?.displayOrder).toBe(1);
  });
});
```

Add `import { ReorderImagesUseCase } from './reorder-images-use-case';` and add `ImageOrderMismatchError` to the existing errors import.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: FAIL — `reorder-images-use-case.ts` doesn't exist.

- [ ] **Step 3: Write `ReorderImagesUseCase`**

Create `apps/catalogue/src/application/reorder-images-use-case.ts`:

```ts
import { Lot } from '../domain/lot';
import { LotRepository } from '../domain/lot-repository';
import { LotNotFoundError, ImageOrderMismatchError } from '../domain/errors';

export class ReorderImagesUseCase {
  constructor(private readonly lotRepository: LotRepository) {}

  async execute(lotId: string, imageIds: string[]): Promise<void> {
    const lot = await this.lotRepository.findById(lotId);
    if (!lot) {
      throw new LotNotFoundError(lotId);
    }

    const currentIds = new Set(lot.images.map(img => img.id));
    const providedIds = new Set(imageIds);
    const isSameSize = currentIds.size === providedIds.size;
    const hasSameMembers = [...currentIds].every(id => providedIds.has(id));
    if (!isSameSize || !hasSameMembers) {
      throw new ImageOrderMismatchError(lotId);
    }

    const imagesById = new Map(lot.images.map(img => [img.id, img]));
    const reordered = imageIds.map((id, index) => ({ ...imagesById.get(id)!, displayOrder: index }));

    const updatedLot = new Lot({
      id: lot.id,
      title: lot.title,
      description: lot.description,
      auctionId: lot.auctionId,
      categoryId: lot.categoryId,
      condition: lot.condition,
      estimatedValue: lot.estimatedValue,
      status: lot.status,
      images: reordered,
      createdBy: lot.createdBy,
      createdAt: lot.createdAt,
      updatedAt: new Date(),
    });

    await this.lotRepository.save(updatedLot);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: PASS for all three new tests.

- [ ] **Step 5: Commit**

```bash
git add apps/catalogue/src/application/reorder-images-use-case.ts apps/catalogue/src/application/use-cases.test.ts
git commit -m "feat(catalogue): add ReorderImagesUseCase"
```

---

### Task 8: Wire the new routes, and stop leaking `key` in API responses

**Files:**
- Modify: `apps/catalogue/src/presentation/catalogue-router.ts`
- Modify: `apps/catalogue/src/presentation/catalogue-router.test.ts`
- Modify: `apps/catalogue/src/main.ts`

**Interfaces:**
- Consumes: `DeleteImageUseCase` (Task 6), `ReorderImagesUseCase` (Task 7).
- Produces: `DELETE /api/lots/:id/images/:imageId` (200/404), `PATCH /api/lots/:id/images/reorder` (200/400/404). `GET /api/lots` and `GET /api/lots/:id` responses no longer include `key` on any image — every response is built through an explicit `toLotResponse` mapper instead of serializing the domain object directly.

- [ ] **Step 1: Write the failing tests**

In `apps/catalogue/src/presentation/catalogue-router.test.ts`, update `buildUseCases` to add the two new use cases:

```ts
function buildUseCases(overrides: Record<string, unknown> = {}) {
  return {
    getLot: { execute: vi.fn().mockResolvedValue(null) },
    listLots: { execute: vi.fn().mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 }) },
    searchLots: { execute: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
    listCategories: { execute: vi.fn().mockResolvedValue([]) },
    requestImageUpload: { execute: vi.fn() },
    confirmImageUpload: { execute: vi.fn() },
    deleteImage: { execute: vi.fn() },
    reorderImages: { execute: vi.fn() },
    ...overrides,
  };
}
```

Add a new `describe` block at the end of the file:

```ts
describe('DELETE /api/lots/:id/images/:imageId', () => {
  it('should_return200_when_imageDeleted', async () => {
    const useCases = buildUseCases({ deleteImage: { execute: vi.fn().mockResolvedValue(undefined) } });
    const app = new Hono().route('/', buildCatalogueRouter(useCases));

    const res = await app.request('/api/lots/lot-1/images/img-1', { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(useCases.deleteImage.execute).toHaveBeenCalledWith('lot-1', 'img-1');
  });

  it('should_return404_when_imageDoesNotExist', async () => {
    const useCases = buildUseCases({
      deleteImage: { execute: vi.fn().mockRejectedValue(new LotImageNotFoundError('img-1')) },
    });
    const app = new Hono().route('/', buildCatalogueRouter(useCases));

    const res = await app.request('/api/lots/lot-1/images/img-1', { method: 'DELETE' });

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/lots/:id/images/reorder', () => {
  it('should_return200_when_reorderValid', async () => {
    const useCases = buildUseCases({ reorderImages: { execute: vi.fn().mockResolvedValue(undefined) } });
    const app = new Hono().route('/', buildCatalogueRouter(useCases));

    const res = await app.request('/api/lots/lot-1/images/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageIds: ['img-2', 'img-1'] }),
    });

    expect(res.status).toBe(200);
    expect(useCases.reorderImages.execute).toHaveBeenCalledWith('lot-1', ['img-2', 'img-1']);
  });

  it('should_return400_when_imageIdsMissing', async () => {
    const app = new Hono().route('/', buildCatalogueRouter(buildUseCases()));

    const res = await app.request('/api/lots/lot-1/images/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it('should_return400_when_imageOrderMismatch', async () => {
    const useCases = buildUseCases({
      reorderImages: { execute: vi.fn().mockRejectedValue(new ImageOrderMismatchError('lot-1')) },
    });
    const app = new Hono().route('/', buildCatalogueRouter(useCases));

    const res = await app.request('/api/lots/lot-1/images/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageIds: ['img-1'] }),
    });

    expect(res.status).toBe(400);
  });
});

describe('response mapping', () => {
  it('should_notIncludeKey_when_lotHasImages', async () => {
    const lotWithImage = new Lot({
      id: 'lot-1',
      title: 'Cartier Love Ring',
      description: null,
      categoryId: 'cat-1',
      condition: LotCondition.Excellent,
      estimatedValue: 3000,
      images: [
        { id: 'img-1', lotId: 'lot-1', key: 'lots/lot-1/a', url: 'https://a', thumbnailUrl: 'https://a_thumb', displayOrder: 0, isPrimary: true },
      ],
      createdBy: null,
      createdAt: new Date('2026-06-20T00:00:00Z'),
      updatedAt: new Date('2026-06-20T00:00:00Z'),
    });
    const useCases = buildUseCases({ getLot: { execute: vi.fn().mockResolvedValue(lotWithImage) } });
    const app = new Hono().route('/', buildCatalogueRouter(useCases));

    const res = await app.request('/api/lots/lot-1');
    const body = await res.json();

    expect(body.data.images[0].key).toBeUndefined();
    expect(body.data.images[0].url).toBe('https://a');
  });
});
```

Add `LotImageNotFoundError, ImageOrderMismatchError` to the existing `import { LotNotFoundError } from '../domain/errors';` line, making it `import { LotNotFoundError, LotImageNotFoundError, ImageOrderMismatchError } from '../domain/errors';`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: FAIL — the new routes don't exist (404 on all of them), and `UseCases` doesn't declare `deleteImage`/`reorderImages` (TS error).

- [ ] **Step 3: Add the `toLotResponse` mapper and wire the new routes**

In `apps/catalogue/src/presentation/catalogue-router.ts`, add the imports:

```ts
import { GetLotUseCase } from '../application/get-lot-use-case';
import { ListLotsUseCase } from '../application/list-lots-use-case';
import { SearchLotsUseCase } from '../application/search-lots-use-case';
import { ListCategoriesUseCase } from '../application/list-categories-use-case';
import { RequestImageUploadUseCase } from '../application/request-image-upload-use-case';
import { ConfirmImageUploadUseCase } from '../application/confirm-image-upload-use-case';
import { DeleteImageUseCase } from '../application/delete-image-use-case';
import { ReorderImagesUseCase } from '../application/reorder-images-use-case';
import { Lot, LotCondition } from '../domain/lot';
import { LotNotFoundError, LotImageNotFoundError, ImageOrderMismatchError } from '../domain/errors';
```

(This replaces the existing import block at the top of the file — `Lot` needs to be added to the `'../domain/lot'` import since `toLotResponse` below takes a `Lot`.)

Add `deleteImage` and `reorderImages` to the `UseCases` interface:

```ts
interface UseCases {
  getLot: Pick<GetLotUseCase, 'execute'>;
  listLots: Pick<ListLotsUseCase, 'execute'>;
  searchLots: Pick<SearchLotsUseCase, 'execute'>;
  listCategories: Pick<ListCategoriesUseCase, 'execute'>;
  requestImageUpload: Pick<RequestImageUploadUseCase, 'execute'>;
  confirmImageUpload: Pick<ConfirmImageUploadUseCase, 'execute'>;
  deleteImage: Pick<DeleteImageUseCase, 'execute'>;
  reorderImages: Pick<ReorderImagesUseCase, 'execute'>;
}
```

Add the mapper function, above `export function buildCatalogueRouter`:

```ts
function toLotResponse(lot: Lot) {
  return {
    id: lot.id,
    title: lot.title,
    description: lot.description,
    auctionId: lot.auctionId,
    categoryId: lot.categoryId,
    condition: lot.condition,
    estimatedValue: lot.estimatedValue,
    status: lot.status,
    images: lot.images.map(img => ({
      id: img.id,
      lotId: img.lotId,
      url: img.url,
      thumbnailUrl: img.thumbnailUrl,
      displayOrder: img.displayOrder,
      isPrimary: img.isPrimary,
    })),
    createdBy: lot.createdBy,
    createdAt: lot.createdAt,
    updatedAt: lot.updatedAt,
  };
}
```

Replace the `GET /api/lots/:id` handler's return:

```ts
    return c.json({ data: toLotResponse(lot) });
```

Replace the `GET /api/lots` handler's return:

```ts
    return c.json({ data: result.items.map(toLotResponse), meta: { total: result.total, limit, offset } });
```

Add the two new routes at the end of `buildCatalogueRouter`, before the final `return router;`:

```ts
  router.delete('/api/lots/:id/images/:imageId', async c => {
    const jwtPayload = c.get('jwtPayload');
    if (!jwtPayload || jwtPayload.role !== 'ADMIN') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403);
    }
    try {
      await useCases.deleteImage.execute(c.req.param('id'), c.req.param('imageId'));
      return c.json({ data: null });
    } catch (err) {
      if (err instanceof LotNotFoundError || err instanceof LotImageNotFoundError) {
        return c.json({ error: { code: 'NOT_FOUND', message: err.message } }, 404);
      }
      throw err;
    }
  });

  router.patch('/api/lots/:id/images/reorder', async c => {
    const jwtPayload = c.get('jwtPayload');
    if (!jwtPayload || jwtPayload.role !== 'ADMIN') {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } }, 403);
    }
    const body = await c.req.json() as { imageIds?: string[] };
    if (!Array.isArray(body.imageIds) || body.imageIds.length === 0) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'imageIds is required' } }, 400);
    }
    try {
      await useCases.reorderImages.execute(c.req.param('id'), body.imageIds);
      return c.json({ data: null });
    } catch (err) {
      if (err instanceof LotNotFoundError) {
        return c.json({ error: { code: 'NOT_FOUND', message: err.message } }, 404);
      }
      if (err instanceof ImageOrderMismatchError) {
        return c.json({ error: { code: 'IMAGE_ORDER_MISMATCH', message: err.message } }, 400);
      }
      throw err;
    }
  });
```

- [ ] **Step 4: Wire the use cases in `main.ts`**

In `apps/catalogue/src/main.ts`, add the imports:

```ts
import { DeleteImageUseCase } from './application/delete-image-use-case';
import { ReorderImagesUseCase } from './application/reorder-images-use-case';
```

Add to the `useCases` object:

```ts
  deleteImage: new DeleteImageUseCase(lotRepository, imageStorage),
  reorderImages: new ReorderImagesUseCase(lotRepository),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/catalogue`
Expected: PASS for the whole suite, including all new tests from this and prior tasks.

- [ ] **Step 6: Commit**

```bash
git add apps/catalogue/src/presentation/catalogue-router.ts apps/catalogue/src/presentation/catalogue-router.test.ts apps/catalogue/src/main.ts
git commit -m "feat(catalogue): wire delete/reorder image routes; stop leaking image key in responses"
```

---

### Task 9: Admin-service — add the missing `confirm` proxy route

**Files:**
- Modify: `apps/admin/src/presentation/lots-router.ts`
- Modify: `apps/admin/src/presentation/routers.test.ts`

**Interfaces:**
- Produces: `POST /admin/api/lots/:id/images/confirm`, proxying to catalogue's existing `POST /api/lots/:id/images/confirm`. The `upload-url`, delete, and reorder proxies already exist and are unchanged — they were already pointed correctly, only the downstream catalogue endpoints (Tasks 6-8) and this one proxy were missing.

This task assumes `lots-router.ts` is in the shape left by the lot-status-category plan's Task 7 (`buildLotsRouter({ catalogue, auction })`, variable named `catalogue`). If that plan has not run, use whatever the single client parameter is named in the current file instead of `catalogue` in Step 3 below.

- [ ] **Step 1: Write the failing test**

In `apps/admin/src/presentation/routers.test.ts`, inside `describe('Lots router', ...)`, add:

```ts
it('should_return200_when_confirmingImageUpload', async () => {
  vi.mocked(mockClient.post).mockResolvedValue({ data: null });
  const app = new Hono().route('/', buildLotsRouter({ catalogue: mockClient, auction: mockClient }));

  const res = await app.request('/admin/api/lots/lot-1/images/confirm', {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageKey: 'lots/lot-1/a', isPrimary: true }),
  });

  expect(res.status).toBe(200);
  expect(mockClient.post).toHaveBeenCalledWith('/api/lots/lot-1/images/confirm', 'admin-token', { imageKey: 'lots/lot-1/a', isPrimary: true });
});
```

(If `buildLotsRouter` still takes a single client at the time this task runs, call it as `buildLotsRouter(mockClient)` instead, matching the other tests in this block.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/admin`
Expected: FAIL — `POST /admin/api/lots/:id/images/confirm` doesn't exist, returns 404.

- [ ] **Step 3: Add the proxy route**

In `apps/admin/src/presentation/lots-router.ts`, add this route immediately after the existing `r.post('/admin/api/lots/:id/images/upload-url', ...)` route:

```ts
  r.post('/admin/api/lots/:id/images/confirm', auth, async c =>
    proxy(async () => catalogue.post(`/api/lots/${c.req.param('id')}/images/confirm`, tok(c), await c.req.json()), c));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/admin`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/presentation/lots-router.ts apps/admin/src/presentation/routers.test.ts
git commit -m "feat(admin): add missing proxy for POST /admin/api/lots/:id/images/confirm"
```

---

### Task 10: Fix the upload-url/confirm contract in admin-portal's server actions

**Files:**
- Modify: `apps/admin-portal/src/app/admin/lots/[id]/_actions.ts`
- Create: `apps/admin-portal/src/app/admin/lots/[id]/_actions.test.ts`

**Interfaces:**
- Produces: `getUploadUrl(lotId: string, contentType: string): Promise<{ uploadUrl: string; imageKey: string }>` (drops the unused `filename` parameter and the nonexistent `imageId`/`publicUrl` fields — matches catalogue's real `RequestImageUploadResult`). New `confirmImage(lotId: string, imageKey: string, isPrimary: boolean): Promise<{ id: string; url: string; thumbnailUrl: string; displayOrder: number; isPrimary: boolean }>`. `deleteImage`/`reorderImages` are unchanged — their contracts were already correct. Consumed by Task 12 (`ImageUploader` rewrite).

This file (`[id]/_actions.ts`) has no existing test — the sibling `apps/admin-portal/src/app/admin/lots/_actions.test.ts` (list-level actions) does, so this task adds the missing coverage rather than leaving it as a gap, matching that established convention.

- [ ] **Step 1: Write the failing test**

Create `apps/admin-portal/src/app/admin/lots/[id]/_actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { adminApi } from '@/lib/admin-api';
import { getUploadUrl, confirmImage, deleteImage, reorderImages } from './_actions';

beforeEach(() => { vi.clearAllMocks(); });

describe('getUploadUrl', () => {
  it('should_returnUploadUrlAndImageKey_when_called', async () => {
    vi.mocked(adminApi.post).mockResolvedValue({ data: { uploadUrl: 'https://r2.example.com/put', imageKey: 'lots/lot-1/a' } });

    const result = await getUploadUrl('lot-1', 'image/jpeg');

    expect(adminApi.post).toHaveBeenCalledWith('/admin/api/lots/lot-1/images/upload-url', { contentType: 'image/jpeg' });
    expect(result).toEqual({ uploadUrl: 'https://r2.example.com/put', imageKey: 'lots/lot-1/a' });
  });
});

describe('confirmImage', () => {
  it('should_callConfirmEndpointAndReturnCreatedImage', async () => {
    vi.mocked(adminApi.post).mockResolvedValue({
      data: { id: 'img-1', url: 'https://a', thumbnailUrl: 'https://a_thumb', displayOrder: 0, isPrimary: true },
    });

    const result = await confirmImage('lot-1', 'lots/lot-1/a', true);

    expect(adminApi.post).toHaveBeenCalledWith('/admin/api/lots/lot-1/images/confirm', { imageKey: 'lots/lot-1/a', isPrimary: true });
    expect(result).toEqual({ id: 'img-1', url: 'https://a', thumbnailUrl: 'https://a_thumb', displayOrder: 0, isPrimary: true });
  });
});

describe('deleteImage', () => {
  it('should_callAdminApiDelete_and_revalidate', async () => {
    vi.mocked(adminApi.delete).mockResolvedValue({ data: null });

    await deleteImage('lot-1', 'img-1');

    expect(adminApi.delete).toHaveBeenCalledWith('/admin/api/lots/lot-1/images/img-1');
  });
});

describe('reorderImages', () => {
  it('should_callAdminApiPatchWithOrderedIds', async () => {
    vi.mocked(adminApi.patch).mockResolvedValue({ data: null });

    await reorderImages('lot-1', ['img-2', 'img-1']);

    expect(adminApi.patch).toHaveBeenCalledWith('/admin/api/lots/lot-1/images/reorder', { imageIds: ['img-2', 'img-1'] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/admin-portal`
Expected: FAIL — `getUploadUrl` currently takes `(lotId, filename, contentType)` and posts `{ filename, contentType }`; `confirmImage` doesn't exist.

- [ ] **Step 3: Fix the actions**

Replace the full contents of `apps/admin-portal/src/app/admin/lots/[id]/_actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { adminApi } from '@/lib/admin-api';

export async function getUploadUrl(
  lotId: string,
  contentType: string,
): Promise<{ uploadUrl: string; imageKey: string }> {
  const res = await adminApi.post<{ data: { uploadUrl: string; imageKey: string } }>(
    `/admin/api/lots/${lotId}/images/upload-url`,
    { contentType },
  );
  return res.data;
}

export interface ConfirmedImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  displayOrder: number;
  isPrimary: boolean;
}

export async function confirmImage(
  lotId: string,
  imageKey: string,
  isPrimary: boolean,
): Promise<ConfirmedImage> {
  const res = await adminApi.post<{ data: ConfirmedImage }>(
    `/admin/api/lots/${lotId}/images/confirm`,
    { imageKey, isPrimary },
  );
  return res.data;
}

export async function deleteImage(lotId: string, imageId: string): Promise<void> {
  await adminApi.delete(`/admin/api/lots/${lotId}/images/${imageId}`);
  revalidatePath(`/admin/lots/${lotId}`);
}

export async function reorderImages(lotId: string, imageIds: string[]): Promise<void> {
  await adminApi.patch(`/admin/api/lots/${lotId}/images/reorder`, { imageIds });
  revalidatePath(`/admin/lots/${lotId}`);
}
```

Note: catalogue's `POST /api/lots/:id/images/confirm` currently returns `{ data: null }` (see `apps/catalogue/src/presentation/catalogue-router.ts`, the `router.post('/api/lots/:id/images/confirm', ...)` handler) — Step 4 fixes that so `confirmImage` gets a real image back instead of `null`, matching `ConfirmedImage` above.

- [ ] **Step 4: Make catalogue's confirm endpoint return the created image**

In `apps/catalogue/src/presentation/catalogue-router.ts`, the `router.post('/api/lots/:id/images/confirm', ...)` handler currently calls `useCases.confirmImageUpload.execute(...)` and returns `c.json({ data: null })`. `ConfirmImageUploadUseCase.execute` (in `apps/catalogue/src/application/confirm-image-upload-use-case.ts`) currently returns `Promise<void>` — change it to return the created `LotImage`:

In `confirm-image-upload-use-case.ts`, change the method signature to `async execute(lotId: string, imageKey: string, isPrimary: boolean): Promise<LotImage>` and add `return newImage;` as the last line of the method (after `await this.lotRepository.save(updatedLot);`).

In `catalogue-router.ts`, change the confirm handler's success path:

```ts
    let createdImage;
    try {
      createdImage = await useCases.confirmImageUpload.execute(c.req.param('id'), body.imageKey, body.isPrimary ?? false);
    } catch (err) {
      if (err instanceof LotNotFoundError) {
        return c.json({ error: { code: 'NOT_FOUND', message: 'Lot not found' } }, 404);
      }
      throw err;
    }
    return c.json({ data: { id: createdImage.id, url: createdImage.url, thumbnailUrl: createdImage.thumbnailUrl, displayOrder: createdImage.displayOrder, isPrimary: createdImage.isPrimary } });
```

(`key` is intentionally excluded from this response, same as `toLotResponse` in Task 8.)

Update the existing `apps/catalogue/src/application/use-cases.test.ts` `ConfirmImageUploadUseCase` tests: since `execute` now returns the created image, add one assertion to `'should_appendImage_without_changingExistingImages_when_isPrimaryIsFalse'`:

```ts
    const returnedImage = await new ConfirmImageUploadUseCase(mockRepo, mockStorage).execute('lot-1', 'lots/lot-1/img', false);
    expect(returnedImage.key).toBe('lots/lot-1/img');
```

(replacing the line that currently calls `.execute(...)` without capturing its result).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/catalogue --filter=@carat-room/admin-portal`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/admin-portal/src/app/admin/lots/[id]/_actions.ts apps/admin-portal/src/app/admin/lots/[id]/_actions.test.ts apps/catalogue/src/presentation/catalogue-router.ts apps/catalogue/src/application/confirm-image-upload-use-case.ts apps/catalogue/src/application/use-cases.test.ts
git commit -m "fix(admin-portal,catalogue): correct upload-url/confirm contract, return created image"
```

---

### Task 11: Fix `page.tsx`'s `LotImage` field names

**Files:**
- Modify: `apps/admin-portal/src/app/admin/lots/[id]/page.tsx`

**Interfaces:**
- Produces: `LotImage` interface matches catalogue's real contract (`url`, `thumbnailUrl`, `displayOrder`) instead of the nonexistent `publicUrl`.

No test file exists for this server component (same convention noted in the lot-status-category plan's Task 11) — verified manually in the final task.

- [ ] **Step 1: Fix the interface**

In `apps/admin-portal/src/app/admin/lots/[id]/page.tsx`, replace:

```ts
interface LotImage {
  id: string;
  publicUrl: string;
  isPrimary: boolean;
}
```

with:

```ts
interface LotImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  displayOrder: number;
  isPrimary: boolean;
}
```

No other change is needed in this file — `lot.images` (now correctly typed) is already passed whole to `<ImageUploader lotId={lot.id} initialImages={lot.images} />`.

- [ ] **Step 2: Type-check**

Run: `pnpm turbo build --filter=@carat-room/admin-portal`
Expected: FAILS at this point — `ImageUploader`'s prop type still expects the old `LotImage` shape with `publicUrl`. This is expected; Task 12 fixes `ImageUploader` itself. Do not attempt to make this task's build pass in isolation — commit it together with Task 12, or treat Tasks 11 and 12 as one commit if your workflow requires green builds per commit.

- [ ] **Step 3: Commit together with Task 12**

Do not commit this task's change alone (see Step 2). Proceed directly to Task 12 and commit both files together there.

---

### Task 12: Rewrite `ImageUploader` — grid, hover controls, drag-and-drop upload and reorder

**Files:**
- Modify: `apps/admin-portal/src/components/image-uploader.tsx`
- Create: `apps/admin-portal/src/components/image-uploader.test.tsx`

**Interfaces:**
- Consumes: `getUploadUrl`, `confirmImage`, `deleteImage`, `reorderImages` (Task 10), `LotImage` (Task 11).
- Produces: `ImageUploader({ lotId, initialImages }: { lotId: string; initialImages: LotImage[] })` — a grid of thumbnails with hover-revealed primary badge, delete button, and drag handle; a `+` tile that opens a multi-file picker and also accepts files dragged from the desktop; drag-and-drop reordering between thumbnails using native HTML5 drag events (no new dependency, per the approved design).

- [ ] **Step 1: Write the failing tests**

Create `apps/admin-portal/src/components/image-uploader.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageUploader } from './image-uploader';

vi.mock('@/app/admin/lots/[id]/_actions', () => ({
  getUploadUrl: vi.fn(),
  confirmImage: vi.fn(),
  deleteImage: vi.fn(),
  reorderImages: vi.fn(),
}));

import { getUploadUrl, confirmImage, deleteImage, reorderImages } from '@/app/admin/lots/[id]/_actions';

const globalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
});

afterEach(() => {
  global.fetch = globalFetch;
});

describe('ImageUploader', () => {
  it('should_renderExistingImages_withPrimaryBadgeOnPrimary', () => {
    render(
      <ImageUploader
        lotId='lot-1'
        initialImages={[
          { id: 'img-1', url: 'https://a.jpg', thumbnailUrl: 'https://a_thumb.jpg', displayOrder: 0, isPrimary: true },
        ]}
      />,
    );

    expect(screen.getByAltText(/lot image/i)).toBeInTheDocument();
  });

  it('should_uploadThenConfirmThenAppendImage_when_fileSelected', async () => {
    vi.mocked(getUploadUrl).mockResolvedValue({ uploadUrl: 'https://r2.example.com/put', imageKey: 'lots/lot-1/a' });
    vi.mocked(confirmImage).mockResolvedValue({ id: 'img-1', url: 'https://a.jpg', thumbnailUrl: 'https://a_thumb.jpg', displayOrder: 0, isPrimary: true });
    const user = userEvent.setup();
    render(<ImageUploader lotId='lot-1' initialImages={[]} />);

    const file = new File(['contents'], 'ring.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/add image/i);
    await user.upload(input, file);

    await waitFor(() => expect(confirmImage).toHaveBeenCalledWith('lot-1', 'lots/lot-1/a', true));
    expect(global.fetch).toHaveBeenCalledWith('https://r2.example.com/put', expect.objectContaining({ method: 'PUT' }));
    await waitFor(() => expect(screen.getAllByAltText(/lot image/i)).toHaveLength(1));
  });

  it('should_notCallConfirm_when_r2UploadFails', async () => {
    vi.mocked(getUploadUrl).mockResolvedValue({ uploadUrl: 'https://r2.example.com/put', imageKey: 'lots/lot-1/a' });
    global.fetch = vi.fn().mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<ImageUploader lotId='lot-1' initialImages={[]} />);

    const file = new File(['contents'], 'ring.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText(/add image/i), file);

    await waitFor(() => expect(screen.getByText(/upload failed/i)).toBeInTheDocument());
    expect(confirmImage).not.toHaveBeenCalled();
  });

  it('should_removeImage_when_deleteClicked', async () => {
    vi.mocked(deleteImage).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ImageUploader
        lotId='lot-1'
        initialImages={[
          { id: 'img-1', url: 'https://a.jpg', thumbnailUrl: 'https://a_thumb.jpg', displayOrder: 0, isPrimary: true },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(deleteImage).toHaveBeenCalledWith('lot-1', 'img-1'));
    expect(screen.queryByAltText(/lot image/i)).not.toBeInTheDocument();
  });
});
```

Add `import { afterEach } from 'vitest';` to the test's imports (extend the existing `import { describe, it, expect, vi, beforeEach } from 'vitest';` to include `afterEach`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm turbo test --filter=@carat-room/admin-portal`
Expected: FAIL — the current `ImageUploader` reads `img.publicUrl` (not `url`), has no `aria-label="Add image"` on its file input, never calls `confirmImage`, and has no `alt='Lot image'` on thumbnails.

- [ ] **Step 3: Rewrite `ImageUploader`**

Replace the full contents of `apps/admin-portal/src/components/image-uploader.tsx`:

```tsx
'use client';

import { useCallback, useRef, useState } from 'react';
import { Star, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getUploadUrl, confirmImage, deleteImage, reorderImages } from '@/app/admin/lots/[id]/_actions';

interface LotImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  displayOrder: number;
  isPrimary: boolean;
}

interface ImageUploaderProps {
  lotId: string;
  initialImages: LotImage[];
}

export function ImageUploader({ lotId, initialImages }: ImageUploaderProps) {
  const [images, setImages] = useState<LotImage[]>(initialImages);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragImageId = useRef<string | null>(null);

  const uploadOne = useCallback(async (file: File) => {
    const { uploadUrl, imageKey } = await getUploadUrl(lotId, file.type);
    const putRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    if (!putRes.ok) {
      throw new Error('Upload failed');
    }
    const isPrimary = images.length === 0;
    const created = await confirmImage(lotId, imageKey, isPrimary);
    setImages(prev => [...prev, created]);
  }, [lotId, images.length]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    setIsUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await uploadOne(file);
      }
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [uploadOne]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) void uploadFiles(files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const imageId = dragImageId.current;
    if (imageId) {
      handleReorderDrop(imageId, null);
      return;
    }
    if (e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files);
  };

  const handleDelete = async (imageId: string) => {
    await deleteImage(lotId, imageId);
    setImages(prev => prev.filter(img => img.id !== imageId));
  };

  const handleReorderDrop = async (draggedId: string, targetId: string | null) => {
    if (!targetId || draggedId === targetId) return;
    const current = [...images].sort((a, b) => a.displayOrder - b.displayOrder);
    const fromIndex = current.findIndex(img => img.id === draggedId);
    const toIndex = current.findIndex(img => img.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...current];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    setImages(reordered.map((img, index) => ({ ...img, displayOrder: index })));
    await reorderImages(lotId, reordered.map(img => img.id));
  };

  return (
    <div
      className='grid grid-cols-4 gap-3'
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      {[...images].sort((a, b) => a.displayOrder - b.displayOrder).map(img => (
        <div
          key={img.id}
          className='group relative aspect-square overflow-hidden rounded border'
          draggable
          onDragStart={() => { dragImageId.current = img.id; }}
          onDragEnd={() => { dragImageId.current = null; }}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); void handleReorderDrop(dragImageId.current ?? '', img.id); }}
        >
          <img src={img.thumbnailUrl} alt='Lot image' className='h-full w-full object-cover' />
          {img.isPrimary && (
            <span className='absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground'>
              <Star className='inline h-3 w-3' /> Primary
            </span>
          )}
          <Button
            variant='ghost'
            size='icon'
            className='absolute right-1 top-1 hidden h-6 w-6 bg-background/80 group-hover:flex'
            aria-label='Delete image'
            onClick={() => void handleDelete(img.id)}
          >
            <X className='h-4 w-4 text-destructive' />
          </Button>
        </div>
      ))}

      <label
        htmlFor='image-upload'
        className='flex aspect-square cursor-pointer flex-col items-center justify-center rounded border border-dashed text-sm text-muted-foreground hover:border-foreground'
      >
        {isUploading ? 'Uploading…' : '+ Add Image'}
        <input
          id='image-upload'
          aria-label='Add image'
          type='file'
          accept='image/*'
          multiple
          className='sr-only'
          onChange={handleFileInputChange}
          disabled={isUploading}
        />
      </label>

      {error && <p className='col-span-full text-sm text-destructive'>{error}</p>}
    </div>
  );
}
```

Note: `Trash2` is imported but unused by this version — remove it from the `lucide-react` import (`import { Star, X } from 'lucide-react';`) since the delete button now uses `X`, not `Trash2` (Boy Scout Rule: no dead imports).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm turbo test --filter=@carat-room/admin-portal`
Expected: PASS for all `ImageUploader` tests.

- [ ] **Step 5: Type-check the whole app (this is where Task 11 and 12 become consistent together)**

Run: `pnpm turbo build --filter=@carat-room/admin-portal`
Expected: PASS — `page.tsx`'s `LotImage` (Task 11) and `ImageUploader`'s prop type now agree.

- [ ] **Step 6: Commit both Task 11 and Task 12 together**

```bash
git add apps/admin-portal/src/app/admin/lots/[id]/page.tsx apps/admin-portal/src/components/image-uploader.tsx apps/admin-portal/src/components/image-uploader.test.tsx
git commit -m "feat(admin-portal): rewrite image manager as grid with hover controls and drag-and-drop"
```

---

### Task 13: Full workspace verification and manual browser walkthrough

**Files:** none (verification only)

- [ ] **Step 1: Run every affected workspace's test suite**

```bash
pnpm turbo test --filter=@carat-room/catalogue --filter=@carat-room/admin --filter=@carat-room/admin-portal
```

Expected: all green.

- [ ] **Step 2: Run the full build**

```bash
pnpm turbo build
```

Expected: no TypeScript errors anywhere in the monorepo.

- [ ] **Step 3: Run `pnpm lint`**

Expected: passes — confirms no Clean Architecture layer-boundary violations (e.g. no `@aws-sdk/client-s3` import leaking outside `apps/catalogue/src/infrastructure/`).

- [ ] **Step 4: Manual browser walkthrough (required — do not skip)**

Start the stack per `CLAUDE.md` (`docker compose up -d`, then `pnpm turbo dev`, and confirm R2 credentials are configured in the catalogue service's environment — image upload will fail against a placeholder bucket), then in a real browser at `/admin/lots/[id]` for an existing lot:

1. Click "+ Add Image", select two image files at once (multi-select in the file picker). Confirm both appear in the grid with a "Primary" badge on the first one uploaded.
2. **Refresh the page.** Confirm both images are still there. This is the step that would have caught the original bug — the old version looked correct right up until refresh, because `confirm` was never called.
3. Drag a file from the desktop file explorer directly onto the grid. Confirm it uploads the same way as the file picker.
4. Hover over a non-primary thumbnail — confirm the delete (×) button appears. Click it, confirm the image disappears and stays gone after a refresh.
5. Delete the current primary image. Confirm the next image (lowest display order) automatically gets the "Primary" badge, and this survives a refresh.
6. Drag one thumbnail to a different position in the grid. Confirm the order changes and survives a refresh.
7. Open the browser's network tab and confirm no R2 object key (e.g. a string starting `lots/...`) appears anywhere in the `GET /admin/api/lots/:id` response body — only `url`/`thumbnailUrl`.

- [ ] **Step 5: Report completion**

Once all seven manual checks pass, this plan is complete. Steps 1-3 catch regressions; only Step 4 proves the actual reported bug (uploads vanishing, broken delete/reorder) is fixed — do not mark this done on automated tests alone.

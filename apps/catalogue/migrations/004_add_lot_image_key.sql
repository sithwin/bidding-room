-- Raw R2 object key per image, needed so DeleteImageUseCase can remove the
-- correct objects from storage without parsing them back out of a public URL.
ALTER TABLE lot_images
  ADD COLUMN IF NOT EXISTS key TEXT NOT NULL DEFAULT '';

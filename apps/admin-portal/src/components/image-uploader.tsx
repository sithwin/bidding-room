'use client';

import { useCallback, useRef, useState } from 'react';
import { Star, X } from 'lucide-react';
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

  const uploadOne = useCallback(async (file: File, isPrimary: boolean) => {
    const { uploadUrl, imageKey } = await getUploadUrl(lotId, file.type);
    const putRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
    if (!putRes.ok) {
      throw new Error('Upload failed');
    }
    const created = await confirmImage(lotId, imageKey, isPrimary);
    setImages(prev => [...prev, created]);
  }, [lotId]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    setIsUploading(true);
    setError(null);
    try {
      const wasEmpty = images.length === 0;
      let uploadedCount = 0;
      for (const file of Array.from(files)) {
        await uploadOne(file, wasEmpty && uploadedCount === 0);
        uploadedCount += 1;
      }
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [uploadOne, images.length]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) void uploadFiles(files);
    e.target.value = '';
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

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const imageId = dragImageId.current;
    if (imageId) {
      void handleReorderDrop(imageId, null);
      return;
    }
    if (e.dataTransfer.files.length > 0) void uploadFiles(e.dataTransfer.files);
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

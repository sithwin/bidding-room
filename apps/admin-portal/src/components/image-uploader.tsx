'use client';

import { useState, useCallback } from 'react';
import { GripVertical, Trash2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getUploadUrl, deleteImage, reorderImages } from '@/app/admin/lots/[id]/_actions';

interface LotImage {
  id: string;
  publicUrl: string;
  isPrimary: boolean;
}

interface ImageUploaderProps {
  lotId: string;
  initialImages: LotImage[];
}

export function ImageUploader({ lotId, initialImages }: ImageUploaderProps) {
  const [images, setImages] = useState<LotImage[]>(initialImages);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const { uploadUrl, imageId, publicUrl } = await getUploadUrl(lotId, file.name, file.type);

      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      setImages(prev => [...prev, { id: imageId, publicUrl, isPrimary: prev.length === 0 }]);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }, [lotId]);

  const handleDelete = async (imageId: string) => {
    await deleteImage(lotId, imageId);
    setImages(prev => prev.filter(img => img.id !== imageId));
  };

  const moveUp = async (index: number) => {
    if (index === 0) return;
    const next = [...images];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setImages(next);
    await reorderImages(lotId, next.map(img => img.id));
  };

  return (
    <div className='space-y-3'>
      <ul className='space-y-2'>
        {images.map((img, idx) => (
          <li key={img.id} className='flex items-center gap-3 rounded border p-2'>
            <GripVertical className='h-4 w-4 cursor-grab text-muted-foreground' />
            <img src={img.publicUrl} alt='' className='h-12 w-12 rounded object-cover' />
            {img.isPrimary && <Star className='h-4 w-4 text-yellow-500' />}
            <Button variant='ghost' size='icon' onClick={() => moveUp(idx)} disabled={idx === 0}>↑</Button>
            <Button variant='ghost' size='icon' onClick={() => handleDelete(img.id)}>
              <Trash2 className='h-4 w-4 text-destructive' />
            </Button>
          </li>
        ))}
      </ul>
      {error && <p className='text-sm text-destructive'>{error}</p>}
      <div>
        <label htmlFor='image-upload' className='cursor-pointer'>
          <Button variant='outline' asChild>
            <span>{uploading ? 'Uploading…' : 'Upload image'}</span>
          </Button>
          <input
            id='image-upload'
            type='file'
            accept='image/*'
            className='sr-only'
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>
    </div>
  );
}

'use client';
import { useRef, useState } from 'react';

interface DropZoneProps {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  hint?: string;
}

export function DropZone({ accept, multiple = false, disabled = false, onFiles, hint }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFiles(files);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onFiles(files);
    e.target.value = '';
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); if (!disabled) setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`border-2 border-dashed rounded-none px-6 py-8 text-center cursor-pointer transition-colors
        ${isDragging ? 'border-ink bg-cream' : 'border-[var(--line)] bg-paper hover:border-ink/40'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input ref={inputRef} type='file' accept={accept} multiple={multiple} disabled={disabled}
        onChange={handleChange} className='sr-only' />
      <svg className='mx-auto mb-3 text-mut' width='24' height='24' fill='none' stroke='currentColor' strokeWidth='1.5' viewBox='0 0 24 24'>
        <path strokeLinecap='round' strokeLinejoin='round' d='M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5' />
      </svg>
      <p className='font-sans text-sm text-mut'>
        {isDragging ? 'Drop to upload' : 'Drag & drop or click to browse'}
      </p>
      {hint && <p className='font-sans text-xs text-mut mt-1'>{hint}</p>}
    </div>
  );
}

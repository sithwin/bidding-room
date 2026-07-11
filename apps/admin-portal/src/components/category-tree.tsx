'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from './confirm-dialog';
import { renameCategory, deleteCategory, createCategory } from '@/app/admin/categories/_actions';
import type { CategoryTreeNode } from '@/lib/categories';

interface CategoryNodeProps {
  category: CategoryTreeNode;
  depth: number;
}

function NewCategoryForm({ parentId, indentPx, onDone }: { parentId?: string; indentPx: number; onDone: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCreate = async () => {
    const result = await createCategory({ name, slug, parentId });
    if (!result.ok) {
      setErrorMessage('Could not create category — check the name and slug are valid and unique.');
      return;
    }
    onDone();
  };

  return (
    <div className='space-y-1 py-1' style={{ paddingLeft: `${indentPx}px` }}>
      <div className='flex items-center gap-2'>
        <Input placeholder='Name' value={name} onChange={e => setName(e.target.value)} className='h-6 w-32 text-sm' autoFocus />
        <Input placeholder='slug' value={slug} onChange={e => setSlug(e.target.value)} className='h-6 w-28 text-sm' />
        <Button size='sm' className='h-6' onClick={handleCreate}>Add</Button>
        <Button size='sm' variant='ghost' className='h-6' onClick={onDone}>Cancel</Button>
      </div>
      {errorMessage && <p className='text-sm text-destructive'>{errorMessage}</p>}
    </div>
  );
}

function CategoryNode({ category, depth }: CategoryNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [nameValue, setNameValue] = useState(category.name);

  const handleRename = async () => {
    await renameCategory(category.id, nameValue);
    setEditing(false);
  };

  const handleDelete = async () => {
    await deleteCategory(category.id);
  };

  return (
    <li>
      <div className='flex items-center gap-2 py-1' style={{ paddingLeft: `${depth * 16}px` }}>
        <Button variant='ghost' size='icon' className='h-5 w-5' onClick={() => setExpanded(e => !e)}>
          {category.children.length > 0
            ? (expanded ? <ChevronDown className='h-3 w-3' /> : <ChevronRight className='h-3 w-3' />)
            : <span className='h-3 w-3' />}
        </Button>
        {editing ? (
          <Input
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={e => e.key === 'Enter' && handleRename()}
            className='h-6 w-48 text-sm'
            autoFocus
          />
        ) : (
          <span className='text-sm'>{category.name}</span>
        )}
        <Button variant='ghost' size='icon' className='h-5 w-5' onClick={() => setEditing(true)}>
          <Pencil className='h-3 w-3' />
        </Button>
        <Button variant='ghost' size='icon' className='h-5 w-5' onClick={() => setAddingChild(true)}>
          <Plus className='h-3 w-3' />
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant='ghost' size='icon' className='h-5 w-5'>
              <Trash2 className='h-3 w-3 text-destructive' />
            </Button>
          }
          title={`Delete "${category.name}"?`}
          description='Cannot delete if lots are assigned to this category.'
          onConfirm={handleDelete}
          confirmLabel='Delete'
        />
      </div>
      {addingChild && (
        <NewCategoryForm parentId={category.id} indentPx={(depth + 1) * 16} onDone={() => setAddingChild(false)} />
      )}
      {expanded && category.children.length > 0 && (
        <ul>
          {category.children.map(child => (
            <CategoryNode key={child.id} category={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CategoryTree({ categories }: { categories: CategoryTreeNode[] }) {
  const [isAddingRoot, setIsAddingRoot] = useState(false);

  return (
    <div className='space-y-2'>
      <div className='flex justify-end'>
        <Button size='sm' onClick={() => setIsAddingRoot(true)}>
          <Plus className='mr-1 h-3 w-3' /> New Category
        </Button>
      </div>
      <ul className='rounded border bg-card p-2'>
        {isAddingRoot && <NewCategoryForm indentPx={0} onDone={() => setIsAddingRoot(false)} />}
        {categories.length === 0 && !isAddingRoot && (
          <li className='p-2 text-sm text-muted-foreground'>No categories yet — use &quot;New Category&quot; to create the first one.</li>
        )}
        {categories.map(cat => (
          <CategoryNode key={cat.id} category={cat} depth={0} />
        ))}
      </ul>
    </div>
  );
}

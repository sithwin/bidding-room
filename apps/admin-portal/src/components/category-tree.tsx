'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from './confirm-dialog';
import { renameCategory, deleteCategory, createCategory } from '@/app/admin/categories/_actions';

interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  children: Category[];
}

interface CategoryNodeProps {
  category: Category;
  depth: number;
}

function CategoryNode({ category, depth }: CategoryNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [nameValue, setNameValue] = useState(category.name);
  const [newChildName, setNewChildName] = useState('');
  const [newChildSlug, setNewChildSlug] = useState('');

  const handleRename = async () => {
    await renameCategory(category.id, nameValue);
    setEditing(false);
  };

  const handleAddChild = async () => {
    await createCategory({ name: newChildName, slug: newChildSlug, parentId: category.id });
    setAddingChild(false);
    setNewChildName('');
    setNewChildSlug('');
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
        <div className='flex items-center gap-2 py-1' style={{ paddingLeft: `${(depth + 1) * 16}px` }}>
          <Input placeholder='Name' value={newChildName} onChange={e => setNewChildName(e.target.value)} className='h-6 w-32 text-sm' autoFocus />
          <Input placeholder='slug' value={newChildSlug} onChange={e => setNewChildSlug(e.target.value)} className='h-6 w-28 text-sm' />
          <Button size='sm' className='h-6' onClick={handleAddChild}>Add</Button>
          <Button size='sm' variant='ghost' className='h-6' onClick={() => setAddingChild(false)}>Cancel</Button>
        </div>
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

export function CategoryTree({ categories }: { categories: Category[] }) {
  return (
    <ul className='rounded border bg-card p-2'>
      {categories.map(cat => (
        <CategoryNode key={cat.id} category={cat} depth={0} />
      ))}
    </ul>
  );
}

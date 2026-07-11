import { z } from 'zod';
import { categorySchema } from '@carat-room/shared-types';

export type FlatCategory = z.infer<typeof categorySchema>;

export interface CategoryTreeNode extends FlatCategory {
  children: CategoryTreeNode[];
}

export interface CategoryOption {
  id: string;
  label: string;
}

export function buildCategoryTree(flat: FlatCategory[]): CategoryTreeNode[] {
  const nodes = new Map<string, CategoryTreeNode>(
    flat.map(category => [category.id, { ...category, children: [] }]),
  );
  const roots: CategoryTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const byDisplayOrder = (a: CategoryTreeNode, b: CategoryTreeNode) => a.displayOrder - b.displayOrder;
  for (const node of nodes.values()) node.children.sort(byDisplayOrder);
  return roots.sort(byDisplayOrder);
}

export function categoryOptions(flat: FlatCategory[]): CategoryOption[] {
  const walk = (nodes: CategoryTreeNode[], prefix: string): CategoryOption[] =>
    nodes.flatMap(node => {
      const label = prefix ? `${prefix} / ${node.name}` : node.name;
      return [{ id: node.id, label }, ...walk(node.children, label)];
    });
  return walk(buildCategoryTree(flat), '');
}

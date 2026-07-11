import { describe, expect, it } from 'vitest';
import { buildCategoryTree, categoryOptions, type FlatCategory } from './categories';

const flat: FlatCategory[] = [
  { id: 'a', name: 'Jewellery', slug: 'jewellery', parentId: null, displayOrder: 1 },
  { id: 'b', name: 'Rings', slug: 'rings', parentId: 'a', displayOrder: 1 },
  { id: 'c', name: 'Bags', slug: 'bags', parentId: null, displayOrder: 2 },
];

describe('categoryOptions', () => {
  it('produces breadcrumb labels depth-first in displayOrder', () => {
    expect(categoryOptions(flat)).toEqual([
      { id: 'a', label: 'Jewellery' },
      { id: 'b', label: 'Jewellery / Rings' },
      { id: 'c', label: 'Bags' },
    ]);
  });

  it('returns an empty array for an empty list', () => {
    expect(categoryOptions([])).toEqual([]);
  });
});

describe('buildCategoryTree', () => {
  it('nests children under their parent ordered by displayOrder', () => {
    const tree = buildCategoryTree(flat);
    expect(tree.map(n => n.id)).toEqual(['a', 'c']);
    expect(tree[0].children.map(n => n.id)).toEqual(['b']);
    expect(tree[1].children).toEqual([]);
  });
});

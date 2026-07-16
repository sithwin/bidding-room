import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/admin-api', () => ({
  adminApi: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock('@/components/image-uploader', () => ({
  ImageUploader: ({ lotId }: { lotId: string }) => <div data-testid='image-uploader'>{lotId}</div>,
}));

vi.mock('./_edit-form', () => ({
  EditLotForm: ({ lot }: { lot: { title: string } }) => <div data-testid='edit-form'>{lot.title}</div>,
}));

import { adminApi } from '@/lib/admin-api';
import EditLotPage from './page';

beforeEach(() => { vi.clearAllMocks(); });

describe('EditLotPage', () => {
  it('should_renderEditFormAndImageUploader_when_lotAndCategoriesFetched', async () => {
    vi.mocked(adminApi.get).mockImplementation((path: string) => {
      if (path.includes('categories')) return Promise.resolve({ data: [] });
      return Promise.resolve({
        data: {
          id: 'lot-1', title: 'Cartier Love Ring', description: 'Authentic piece', categoryId: 'cat-1',
          condition: 'EXCELLENT', estimatedValue: 3000, status: 'ACTIVE', auctionStatus: null,
          images: [],
        },
      });
    });

    const jsx = await EditLotPage({ params: Promise.resolve({ id: 'lot-1' }) });
    render(jsx);

    expect(screen.getByTestId('edit-form')).toHaveTextContent('Cartier Love Ring');
    expect(screen.getByTestId('image-uploader')).toHaveTextContent('lot-1');
    expect(adminApi.get).toHaveBeenCalledWith('/admin/api/lots/lot-1');
  });
});

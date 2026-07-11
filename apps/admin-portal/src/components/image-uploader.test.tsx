import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
    expect(screen.getByText(/primary/i)).toBeInTheDocument();
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

  it('should_markOnlyFirstImagePrimary_when_multipleFilesUploadedToEmptyGrid', async () => {
    vi.mocked(getUploadUrl)
      .mockResolvedValueOnce({ uploadUrl: 'https://r2.example.com/put-1', imageKey: 'lots/lot-1/a' })
      .mockResolvedValueOnce({ uploadUrl: 'https://r2.example.com/put-2', imageKey: 'lots/lot-1/b' });
    vi.mocked(confirmImage)
      .mockResolvedValueOnce({ id: 'img-1', url: 'https://a.jpg', thumbnailUrl: 'https://a_thumb.jpg', displayOrder: 0, isPrimary: true })
      .mockResolvedValueOnce({ id: 'img-2', url: 'https://b.jpg', thumbnailUrl: 'https://b_thumb.jpg', displayOrder: 1, isPrimary: false });
    const user = userEvent.setup();
    render(<ImageUploader lotId='lot-1' initialImages={[]} />);

    const fileOne = new File(['contents-1'], 'ring.jpg', { type: 'image/jpeg' });
    const fileTwo = new File(['contents-2'], 'necklace.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/add image/i);
    await user.upload(input, [fileOne, fileTwo]);

    await waitFor(() => expect(confirmImage).toHaveBeenCalledTimes(2));
    expect(confirmImage).toHaveBeenNthCalledWith(1, 'lot-1', 'lots/lot-1/a', true);
    expect(confirmImage).toHaveBeenNthCalledWith(2, 'lot-1', 'lots/lot-1/b', false);
  });

  it('should_callReorderImagesWithNewOrder_when_imageDraggedAndDropped', async () => {
    vi.mocked(reorderImages).mockResolvedValue(undefined);
    render(
      <ImageUploader
        lotId='lot-1'
        initialImages={[
          { id: 'img-1', url: 'https://a.jpg', thumbnailUrl: 'https://a_thumb.jpg', displayOrder: 0, isPrimary: true },
          { id: 'img-2', url: 'https://b.jpg', thumbnailUrl: 'https://b_thumb.jpg', displayOrder: 1, isPrimary: false },
        ]}
      />,
    );

    const tiles = screen.getAllByAltText(/lot image/i).map(img => img.parentElement as HTMLElement);
    const [firstTile, secondTile] = tiles;

    fireEvent.dragStart(secondTile, { dataTransfer: { files: [] } });
    fireEvent.drop(firstTile, { dataTransfer: { files: [] } });

    await waitFor(() => expect(reorderImages).toHaveBeenCalledWith('lot-1', ['img-2', 'img-1']));
  });
});

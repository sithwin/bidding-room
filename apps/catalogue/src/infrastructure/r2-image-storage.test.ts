import { describe, it, expect } from 'vitest';
import { R2ImageStorage } from './r2-image-storage';

describe('R2ImageStorage', () => {
  const storage = new R2ImageStorage({
    bucket: 'carat-room-test',
    accountId: 'test-account-id',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    publicBaseUrl: 'https://assets.example.com',
  });

  it('should_returnPresignedUrl_containing_imageKey_when_generatePresignedUploadUrl', async () => {
    const url = await storage.generatePresignedUploadUrl('lots/lot-1/img-1', 'image/jpeg');

    expect(url).toContain('lots/lot-1/img-1');
  });

  it('should_returnPublicUrl_when_getPublicUrl', async () => {
    const url = await storage.getPublicUrl('lots/lot-1/img-1');

    expect(url).toBe('https://assets.example.com/lots/lot-1/img-1');
  });
});

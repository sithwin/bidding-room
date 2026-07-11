import { describe, it, expect, vi } from 'vitest';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
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

  it('should_sendDeleteObjectCommand_when_deleteObjectCalled', async () => {
    const sendSpy = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue(undefined as never);

    await expect(storage.deleteObject('lots/lot-1/img-1')).resolves.toBeUndefined();

    const command = sendSpy.mock.calls[0][0] as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({ Bucket: 'carat-room-test', Key: 'lots/lot-1/img-1' });
    sendSpy.mockRestore();
  });
});

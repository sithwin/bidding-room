import { describe, it, expect, vi } from 'vitest';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { R2UploadClient } from './r2-upload-client';

vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn().mockResolvedValue({});
  return {
    S3Client: vi.fn(() => ({ send: mockSend })),
    PutObjectCommand: vi.fn((input) => ({ input })),
    __mockSend: mockSend,
  };
});

describe('R2UploadClient', () => {
  it('calls PutObjectCommand with correct parameters', async () => {
    const client = new R2UploadClient({
      accountId: 'acc',
      accessKeyId: 'k',
      secretAccessKey: 's',
      bucketName: 'b',
    });
    const mod = vi.mocked(S3Client).mock.results[0].value as { send: ReturnType<typeof vi.fn> };

    await client.upload('valuation-enquiries/uploads/abc.jpg', Buffer.from('img'), 'image/jpeg');

    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'b',
      Key: 'valuation-enquiries/uploads/abc.jpg',
      Body: expect.any(Buffer),
      ContentType: 'image/jpeg',
    });
    expect(mod.send).toHaveBeenCalledOnce();
  });
});

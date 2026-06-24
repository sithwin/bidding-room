import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  let client: R2UploadClient;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new R2UploadClient({
      accountId: 'test-account',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      bucketName: 'test-bucket',
    });
    const mod = vi.mocked(S3Client).mock.results[0].value as { send: ReturnType<typeof vi.fn> };
    mockSend = mod.send;
  });

  it('calls PutObjectCommand with correct key, body, and content type', async () => {
    const body = Buffer.from('test-content');
    await client.upload('identity-docs/user-1/doc.jpg', body, 'image/jpeg');

    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'identity-docs/user-1/doc.jpg',
      Body: body,
      ContentType: 'image/jpeg',
    });
    expect(mockSend).toHaveBeenCalledOnce();
  });
});

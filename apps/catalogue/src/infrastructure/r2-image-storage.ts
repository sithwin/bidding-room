import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ImageStorage } from '../application/image-storage';

interface R2Config {
  bucket: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

export class R2ImageStorage implements ImageStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: R2Config) {
    this.bucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl.replace(/\/$/, '');
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async generatePresignedUploadUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }

  async getPublicUrl(key: string): Promise<string> {
    return `${this.publicBaseUrl}/${key}`;
  }
}

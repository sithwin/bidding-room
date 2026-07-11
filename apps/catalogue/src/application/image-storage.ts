export interface ImageStorage {
  generatePresignedUploadUrl(key: string, contentType: string): Promise<string>;
  getPublicUrl(key: string): Promise<string>;
  deleteObject(key: string): Promise<void>;
}

import { v4 as uuidv4 } from 'uuid';
import { ImageStorage } from './image-storage';

export interface RequestImageUploadResult {
  uploadUrl: string;
  imageKey: string;
}

export class RequestImageUploadUseCase {
  constructor(private readonly imageStorage: ImageStorage) {}

  async execute(lotId: string, contentType: string): Promise<RequestImageUploadResult> {
    const imageKey = `lots/${lotId}/${uuidv4()}`;
    const uploadUrl = await this.imageStorage.generatePresignedUploadUrl(imageKey, contentType);
    return { uploadUrl, imageKey };
  }
}

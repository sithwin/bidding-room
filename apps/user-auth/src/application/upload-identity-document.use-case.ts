import { UserRepository } from '../domain/user-repository';
import { R2UploadClient } from '../infrastructure/r2/r2-upload-client';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_BYTES = 10 * 1024 * 1024;

interface Input {
  userId: string;
  fileBuffer: Buffer;
  contentType: string;
  originalFilename: string;
}

export class UploadIdentityDocumentUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly r2: R2UploadClient,
  ) {}

  async execute(input: Input): Promise<{ status: 'pending_review' }> {
    if (!ALLOWED_TYPES.has(input.contentType)) {
      throw new Error('Unsupported file type');
    }
    if (input.fileBuffer.byteLength > MAX_BYTES) {
      throw new Error('File exceeds 10 MB limit');
    }

    const user = await this.userRepo.findById(input.userId);
    if (!user) throw new Error('User not found');

    const ext = input.originalFilename.split('.').pop() ?? 'bin';
    const key = `identity-docs/${user.id}/${Date.now()}.${ext}`;

    await this.r2.upload(key, input.fileBuffer, input.contentType);
    user.submitIdentityDocument(key);
    await this.userRepo.save(user);

    return { status: 'pending_review' };
  }
}

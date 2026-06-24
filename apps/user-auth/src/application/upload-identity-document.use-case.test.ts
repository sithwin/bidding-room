import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadIdentityDocumentUseCase } from './upload-identity-document.use-case';
import { User, UserStatus, UserRole } from '../domain/user';

const mockRepo = {
  findById: vi.fn(),
  findByEmail: vi.fn(),
  save: vi.fn(),
};
const mockR2 = {
  upload: vi.fn(),
};

function makeUser(status: UserStatus): User {
  return User.reconstitute({
    id: 'user-1',
    email: 'a@b.com',
    passwordHash: 'hash',
    phone: '+61400000000',
    status,
    role: UserRole.BUYER,
    country: null,
    identityDocumentKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('UploadIdentityDocumentUseCase', () => {
  let useCase: UploadIdentityDocumentUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new UploadIdentityDocumentUseCase(mockRepo as any, mockR2 as any);
  });

  it('uploads file to R2 and sets PENDING_REVIEW on user', async () => {
    const user = makeUser(UserStatus.PHONE_VERIFIED);
    mockRepo.findById.mockResolvedValue(user);
    mockR2.upload.mockResolvedValue(undefined);
    mockRepo.save.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: 'user-1',
      fileBuffer: Buffer.from('fake-pdf'),
      contentType: 'application/pdf',
      originalFilename: 'passport.pdf',
    });

    expect(mockR2.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^identity-docs\/user-1\/.+\.pdf$/),
      expect.any(Buffer),
      'application/pdf',
    );
    expect(mockRepo.save).toHaveBeenCalledOnce();
    expect(user.status).toBe(UserStatus.PENDING_REVIEW);
    expect(result).toEqual({ status: 'pending_review' });
  });

  it('throws if user not found', async () => {
    mockRepo.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ userId: 'missing', fileBuffer: Buffer.from(''), contentType: 'image/jpeg', originalFilename: 'id.jpg' }),
    ).rejects.toThrow('User not found');
  });

  it('rejects unsupported file types', async () => {
    await expect(
      useCase.execute({ userId: 'user-1', fileBuffer: Buffer.from(''), contentType: 'text/plain', originalFilename: 'doc.txt' }),
    ).rejects.toThrow('Unsupported file type');
  });

  it('rejects files exceeding 10 MB', async () => {
    const user = makeUser(UserStatus.PHONE_VERIFIED);
    mockRepo.findById.mockResolvedValue(user);
    const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);
    await expect(
      useCase.execute({ userId: 'user-1', fileBuffer: largeBuffer, contentType: 'image/jpeg', originalFilename: 'big.jpg' }),
    ).rejects.toThrow('File exceeds 10 MB limit');
  });

  it('accepts image/jpeg and image/png content types', async () => {
    for (const contentType of ['image/jpeg', 'image/png']) {
      vi.clearAllMocks();
      const user = makeUser(UserStatus.PHONE_VERIFIED);
      mockRepo.findById.mockResolvedValue(user);
      mockR2.upload.mockResolvedValue(undefined);
      mockRepo.save.mockResolvedValue(undefined);

      const result = await useCase.execute({
        userId: 'user-1',
        fileBuffer: Buffer.from('fake-image'),
        contentType,
        originalFilename: 'photo.jpg',
      });

      expect(result).toEqual({ status: 'pending_review' });
    }
  });
});

import { describe, it, expect } from 'vitest';
import { User, UserStatus, UserRole, AuthProvider } from './user';

const makeUser = () =>
  User.create({
    id: 'u-1',
    email: 'jane@example.com',
    passwordHash: 'hashed',
    role: UserRole.BUYER,
  });

describe('User', () => {
  describe('verifyEmail', () => {
    it('should_setStatusToEmailVerified_when_statusIsRegistered', () => {
      const user = makeUser();

      user.verifyEmail();

      expect(user.status).toBe(UserStatus.EMAIL_VERIFIED);
    });

    it('should_throwError_when_emailAlreadyVerified', () => {
      const user = makeUser();
      user.verifyEmail();

      expect(() => user.verifyEmail()).toThrow('Email already verified');
    });
  });

  describe('requestPhoneVerification', () => {
    it('should_setPhone_when_emailVerified', () => {
      const user = makeUser();
      user.verifyEmail();

      user.requestPhoneVerification('+61412345678');

      expect(user.phone).toBe('+61412345678');
    });

    it('should_throwError_when_emailNotYetVerified', () => {
      const user = makeUser();

      expect(() => user.requestPhoneVerification('+61412345678')).toThrow(
        'Email must be verified before phone verification',
      );
    });
  });

  describe('verifyPhone', () => {
    it('should_setStatusToPhoneVerified_when_emailVerifiedAndPhoneSet', () => {
      const user = makeUser();
      user.verifyEmail();
      user.requestPhoneVerification('+61412345678');

      user.verifyPhone();

      expect(user.status).toBe(UserStatus.PHONE_VERIFIED);
    });

    it('should_throwError_when_phoneNotSet', () => {
      const user = makeUser();
      user.verifyEmail();

      expect(() => user.verifyPhone()).toThrow('Phone not set');
    });
  });

  describe('suspend', () => {
    it('should_setStatusToSuspended', () => {
      const user = makeUser();

      user.suspend();

      expect(user.status).toBe(UserStatus.SUSPENDED);
    });
  });

  describe('updateProfile', () => {
    it('should_updateCountry_when_countryProvided', () => {
      const user = makeUser();

      user.updateProfile({ country: 'AU' });

      expect(user.country).toBe('AU');
    });
  });

  describe('submitIdentityDocument', () => {
    it('should_setIdentityDocumentKeyAndStatusToPendingReview_when_emailVerified', () => {
      const user = makeUser();
      user.verifyEmail();

      user.submitIdentityDocument('doc-key-123');

      expect(user.identityDocumentKey).toBe('doc-key-123');
      expect(user.status).toBe(UserStatus.PENDING_REVIEW);
    });

    it('should_throwError_when_emailNotYetVerified', () => {
      const user = makeUser();

      expect(() => user.submitIdentityDocument('doc-key-123')).toThrow(
        'Email must be verified before submitting identity',
      );
    });
  });

  describe('approve', () => {
    it('should_setStatusToApprovedBidder', () => {
      const user = makeUser();
      user.verifyEmail();
      user.requestPhoneVerification('+61412345678');
      user.verifyPhone();
      user.submitIdentityDocument('doc-key-123');

      user.approve();

      expect(user.status).toBe(UserStatus.APPROVED_BIDDER);
    });
  });

  describe('changeEmail', () => {
    it('updates the email and updatedAt', () => {
      const user = User.create({ id: 'u1', email: 'old@example.com', passwordHash: 'h', role: UserRole.BUYER });
      const before = user.updatedAt;
      user.changeEmail('new@example.com');
      expect(user.email).toBe('new@example.com');
      expect(user.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  it('should_startAtEmailVerifiedWithNoPassword_when_createdFromGoogle', () => {
    const user = User.createFromGoogle({
      id: 'u-1',
      email: 'jane@example.com',
      googleId: 'google-sub-123',
      role: UserRole.BUYER,
    });

    expect(user.passwordHash).toBeNull();
    expect(user.googleId).toBe('google-sub-123');
    expect(user.authProvider).toBe('GOOGLE');
    expect(user.status).toBe(UserStatus.EMAIL_VERIFIED);
  });

  it('should_setAuthProviderToBoth_when_linkingGoogleToPasswordAccount', () => {
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'h', role: UserRole.BUYER });

    user.linkGoogleAccount('google-sub-123');

    expect(user.googleId).toBe('google-sub-123');
    expect(user.authProvider).toBe('BOTH');
  });

  it('should_throwError_when_linkingGoogleToAccountAlreadyLinked', () => {
    const user = User.createFromGoogle({ id: 'u-1', email: 'jane@example.com', googleId: 'google-sub-123', role: UserRole.BUYER });

    expect(() => user.linkGoogleAccount('google-sub-456')).toThrow('Google account already linked');
  });

  it('should_setAuthProviderToBoth_when_settingPasswordOnGoogleOnlyAccount', () => {
    const user = User.createFromGoogle({ id: 'u-1', email: 'jane@example.com', googleId: 'google-sub-123', role: UserRole.BUYER });

    user.setPassword('new-hash');

    expect(user.passwordHash).toBe('new-hash');
    expect(user.authProvider).toBe('BOTH');
  });

  it('should_throwError_when_settingPasswordOnAccountThatAlreadyHasOne', () => {
    const user = User.create({ id: 'u-1', email: 'jane@example.com', passwordHash: 'h', role: UserRole.BUYER });

    expect(() => user.setPassword('new-hash')).toThrow('Password already set');
  });
});

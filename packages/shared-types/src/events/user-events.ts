export interface UserRegisteredPayload {
  userId: string;
  email: string;
  createdAt: string; // ISO 8601
}

export interface PhoneVerificationRequestedPayload {
  userId: string;
  phone: string;
  otpCode: string;
}

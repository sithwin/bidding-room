export interface UserRegisteredPayload {
  userId: string;
  email: string;
  emailVerificationCode: string;
}

export interface PhoneVerificationRequestedPayload {
  userId: string;
  phone: string;
  otpCode: string;
}

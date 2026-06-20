export interface UserRegisteredPayload {
    userId: string;
    email: string;
    createdAt: string;
}
export interface PhoneVerificationRequestedPayload {
    userId: string;
    phone: string;
    otpCode: string;
}
//# sourceMappingURL=user-events.d.ts.map
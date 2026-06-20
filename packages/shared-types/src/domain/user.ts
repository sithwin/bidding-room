export type UserStatus =
  | 'REGISTERED'
  | 'EMAIL_VERIFIED'
  | 'APPROVED_BIDDER'
  | 'SUSPENDED';

export type UserRole = 'BUYER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  role: UserRole;
  country: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

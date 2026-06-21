export enum UserStatus {
  REGISTERED = 'REGISTERED',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  APPROVED_BIDDER = 'APPROVED_BIDDER',
  SUSPENDED = 'SUSPENDED',
}

export enum UserRole {
  BUYER = 'BUYER',
  ADMIN = 'ADMIN',
}

export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  phone: string | null;
  status: UserStatus;
  role: UserRole;
  country: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class User {
  private props: UserProps;

  private constructor(props: UserProps) {
    this.props = props;
  }

  static create(params: {
    id: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    country?: string;
  }): User {
    return new User({
      id: params.id,
      email: params.email,
      passwordHash: params.passwordHash,
      phone: null,
      status: UserStatus.REGISTERED,
      role: params.role,
      country: params.country ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  static reconstitute(props: UserProps): User {
    return new User(props);
  }

  get id(): string { return this.props.id; }
  get email(): string { return this.props.email; }
  get passwordHash(): string { return this.props.passwordHash; }
  get phone(): string | null { return this.props.phone; }
  get status(): UserStatus { return this.props.status; }
  get role(): UserRole { return this.props.role; }
  get country(): string | null { return this.props.country; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  verifyEmail(): void {
    if (this.props.status !== UserStatus.REGISTERED) {
      throw new Error('Email already verified');
    }
    this.props.status = UserStatus.EMAIL_VERIFIED;
    this.props.updatedAt = new Date();
  }

  requestPhoneVerification(phone: string): void {
    if (this.props.status === UserStatus.REGISTERED) {
      throw new Error('Email must be verified before phone verification');
    }
    this.props.phone = phone;
    this.props.updatedAt = new Date();
  }

  verifyPhone(): void {
    if (!this.props.phone) {
      throw new Error('Phone not set');
    }
    this.props.status = UserStatus.APPROVED_BIDDER;
    this.props.updatedAt = new Date();
  }

  suspend(): void {
    this.props.status = UserStatus.SUSPENDED;
    this.props.updatedAt = new Date();
  }

  updateProfile(patch: { country?: string }): void {
    if (patch.country !== undefined) {
      this.props.country = patch.country;
    }
    this.props.updatedAt = new Date();
  }

  toProps(): UserProps {
    return { ...this.props };
  }
}

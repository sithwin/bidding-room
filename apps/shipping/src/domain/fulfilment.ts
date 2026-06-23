export enum FulfilmentStatus {
  PENDING_CHOICE = 'PENDING_CHOICE',
  PENDING_DISPATCH = 'PENDING_DISPATCH',
  DISPATCHED = 'DISPATCHED',
  COLLECTED = 'COLLECTED',
}

export enum FulfilmentMethod {
  SHIP = 'SHIP',
  COLLECT = 'COLLECT',
}

export interface ShippingAddress {
  id: string;
  fulfilmentId: string;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postcode: string;
  country: string;
}

export interface CollectionSlot {
  id: string;
  fulfilmentId: string;
  location: string;
  date: string;
  timeSlot: string;
}

export interface FulfilmentProps {
  id: string;
  lotId: string;
  userId: string;
  method: FulfilmentMethod | null;
  status: FulfilmentStatus;
  shippingAddress: ShippingAddress | null;
  collectionSlot: CollectionSlot | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Fulfilment {
  private props: FulfilmentProps;

  private constructor(props: FulfilmentProps) {
    this.props = props;
  }

  static create(params: { id: string; lotId: string; userId: string }): Fulfilment {
    return new Fulfilment({
      id: params.id,
      lotId: params.lotId,
      userId: params.userId,
      method: null,
      status: FulfilmentStatus.PENDING_CHOICE,
      shippingAddress: null,
      collectionSlot: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  static reconstitute(props: FulfilmentProps): Fulfilment {
    return new Fulfilment(props);
  }

  get id(): string { return this.props.id; }
  get lotId(): string { return this.props.lotId; }
  get userId(): string { return this.props.userId; }
  get method(): FulfilmentMethod | null { return this.props.method; }
  get status(): FulfilmentStatus { return this.props.status; }
  get shippingAddress(): ShippingAddress | null { return this.props.shippingAddress; }
  get collectionSlot(): CollectionSlot | null { return this.props.collectionSlot; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  chooseShip(address: ShippingAddress): void {
    if (this.props.method !== null) {
      throw new Error('Fulfilment method already chosen');
    }
    this.props.method = FulfilmentMethod.SHIP;
    this.props.status = FulfilmentStatus.PENDING_DISPATCH;
    this.props.shippingAddress = address;
    this.props.updatedAt = new Date();
  }

  chooseCollect(slot: CollectionSlot): void {
    if (this.props.method !== null) {
      throw new Error('Fulfilment method already chosen');
    }
    this.props.method = FulfilmentMethod.COLLECT;
    this.props.status = FulfilmentStatus.PENDING_DISPATCH;
    this.props.collectionSlot = slot;
    this.props.updatedAt = new Date();
  }

  markDispatched(): void {
    if (this.props.status !== FulfilmentStatus.PENDING_DISPATCH) {
      throw new Error('Cannot dispatch: fulfilment not pending dispatch');
    }
    this.props.status = FulfilmentStatus.DISPATCHED;
    this.props.updatedAt = new Date();
  }

  markCollected(): void {
    if (this.props.status !== FulfilmentStatus.PENDING_DISPATCH) {
      throw new Error('Cannot mark collected: fulfilment not pending dispatch');
    }
    this.props.status = FulfilmentStatus.COLLECTED;
    this.props.updatedAt = new Date();
  }

  toProps(): FulfilmentProps {
    return { ...this.props };
  }
}

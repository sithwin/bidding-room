export type AuctionStatus = 'upcoming' | 'open' | 'closed';

interface AuctionProps {
  id: string;
  title: string;
  saleDate: Date | null;
  location: string | null;
  viewingDates: string | null;
  status: AuctionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class Auction {
  private readonly props: AuctionProps;

  constructor(props: AuctionProps) {
    this.props = props;
  }

  get id(): string { return this.props.id; }
  get title(): string { return this.props.title; }
  get saleDate(): Date | null { return this.props.saleDate; }
  get location(): string | null { return this.props.location; }
  get viewingDates(): string | null { return this.props.viewingDates; }
  get status(): AuctionStatus { return this.props.status; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }
}

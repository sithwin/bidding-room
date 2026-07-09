import type {
  AuctionClosedPayload,
  AuctionClosingSoonPayload,
  BidPlacedPayload,
} from '@carat-room/shared-types';

export interface AuctionEventPublisher {
  publishBidPlaced(payload: BidPlacedPayload): Promise<void>;
  publishAuctionClosingSoon(payload: AuctionClosingSoonPayload): Promise<void>;
  publishAuctionClosed(payload: AuctionClosedPayload): Promise<void>;
}

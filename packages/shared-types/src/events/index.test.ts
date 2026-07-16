import { describe, it, expect } from 'vitest';
import { ROUTING_KEYS } from './index';

describe('ROUTING_KEYS', () => {
  it('should_exposeDotSeparatedRoutingKey_when_readingAuctionBidPlaced', () => {
    expect(ROUTING_KEYS.AUCTION_BID_PLACED).toBe('auction.bid.placed');
  });

  it('should_haveNoDuplicateValues_when_allKeysCompared', () => {
    const values = Object.values(ROUTING_KEYS);

    expect(new Set(values).size).toBe(values.length);
  });
});

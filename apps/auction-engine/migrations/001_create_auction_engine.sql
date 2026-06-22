-- Event store: append-only, never updated
CREATE TABLE auction_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id       UUID NOT NULL,
  sequence     BIGINT NOT NULL,
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lot_id, sequence)
);

CREATE INDEX auction_events_lot_id_idx ON auction_events (lot_id, sequence);

-- Read projection: rebuilt from events; reserve_price is NEVER stored here
CREATE TABLE lot_status (
  lot_id              UUID PRIMARY KEY,
  status              TEXT NOT NULL,
  current_highest_bid NUMERIC(12,2),
  bid_count           INT NOT NULL DEFAULT 0,
  end_at              TIMESTAMPTZ NOT NULL,
  winner_user_id      UUID,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Read projection: bid history (amounts only — user_id stored for ownership checks, not exposed via API)
CREATE TABLE bids (
  id         UUID PRIMARY KEY,
  lot_id     UUID NOT NULL,
  user_id    UUID NOT NULL,
  amount     NUMERIC(12,2) NOT NULL,
  placed_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX bids_lot_id_idx ON bids (lot_id, placed_at DESC);

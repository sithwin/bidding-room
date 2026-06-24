-- Add department label to lots for browse filter grouping
ALTER TABLE lots
  ADD COLUMN IF NOT EXISTS department TEXT;

-- Catalogue-level auction metadata (separate from auction-engine event store)
CREATE TABLE IF NOT EXISTS auctions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         TEXT NOT NULL,
  sale_date     TIMESTAMPTZ,
  location      TEXT,
  viewing_dates TEXT,
  status        TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming', 'open', 'closed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link lots to auctions
ALTER TABLE lots
  ADD COLUMN IF NOT EXISTS auction_id UUID REFERENCES auctions(id);

CREATE INDEX IF NOT EXISTS lots_auction_id_idx ON lots(auction_id);
CREATE INDEX IF NOT EXISTS lots_department_idx ON lots(department);

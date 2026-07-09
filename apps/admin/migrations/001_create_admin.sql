CREATE TABLE valuation_enquiries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category     TEXT NOT NULL,
  artist_maker TEXT,
  description  TEXT NOT NULL,
  photo_keys   TEXT[] NOT NULL DEFAULT '{}',
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','RESPONDED','CLOSED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX valuation_enquiries_status_idx ON valuation_enquiries (status, created_at DESC);

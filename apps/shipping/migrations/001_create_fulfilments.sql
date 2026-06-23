CREATE TABLE fulfilments (
  id              UUID PRIMARY KEY,
  lot_id          UUID NOT NULL,
  user_id         UUID NOT NULL,
  method          TEXT,               -- SHIP | COLLECT (null until chosen)
  status          TEXT NOT NULL,      -- PENDING_CHOICE | PENDING_DISPATCH | DISPATCHED | COLLECTED
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shipping_addresses (
  id              UUID PRIMARY KEY,
  fulfilment_id   UUID NOT NULL REFERENCES fulfilments(id),
  full_name       TEXT NOT NULL,
  line1           TEXT NOT NULL,
  line2           TEXT,
  city            TEXT NOT NULL,
  state           TEXT,
  postcode        TEXT NOT NULL,
  country         TEXT NOT NULL  -- ISO 3166-1 alpha-2
);

CREATE TABLE collection_slots (
  id              UUID PRIMARY KEY,
  fulfilment_id   UUID NOT NULL REFERENCES fulfilments(id),
  location        TEXT NOT NULL,
  date            DATE NOT NULL,
  time_slot       TEXT NOT NULL
);

CREATE INDEX idx_fulfilments_user_id ON fulfilments(user_id);
CREATE INDEX idx_fulfilments_lot_id  ON fulfilments(lot_id);

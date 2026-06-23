-- Creates all test databases and runs schema migrations.
-- Mounted at /docker-entrypoint-initdb.d/init.sql in the postgres container.
-- Runs as the carat superuser (POSTGRES_USER=carat).

CREATE DATABASE user_test;
CREATE DATABASE catalogue_test;
CREATE DATABASE auction_test;
CREATE DATABASE payment_test;
CREATE DATABASE shipping_test;
CREATE DATABASE notification_test;

-- ── User service ─────────────────────────────────────────────────────────────
\c user_test

CREATE TABLE users (
  id              UUID PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  phone           TEXT,
  status          TEXT NOT NULL DEFAULT 'REGISTERED',
  role            TEXT NOT NULL DEFAULT 'BUYER',
  country         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE verification_tokens (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,
  code        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id),
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX idx_users_email               ON users(email);
CREATE INDEX idx_verification_tokens_user  ON verification_tokens(user_id);
CREATE INDEX idx_refresh_tokens_user       ON refresh_tokens(user_id);

-- ── Catalogue service ─────────────────────────────────────────────────────────
\c catalogue_test

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE categories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  parent_id     UUID REFERENCES categories(id),
  display_order INT NOT NULL DEFAULT 0
);

CREATE TABLE lots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT NOT NULL,
  description     TEXT,
  category_id     UUID REFERENCES categories(id),
  condition       TEXT CHECK (condition IN ('NEW', 'EXCELLENT', 'VERY_GOOD', 'GOOD')),
  estimated_value NUMERIC(12,2),
  search_vector   TSVECTOR,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lot_images (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_id        UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX lots_search_idx ON lots USING GIN(search_vector);
CREATE INDEX lot_images_lot_id_idx ON lot_images(lot_id);

CREATE FUNCTION lots_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lots_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, description ON lots
  FOR EACH ROW EXECUTE FUNCTION lots_search_vector_update();

-- ── Auction engine ────────────────────────────────────────────────────────────
\c auction_test

CREATE TABLE auction_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id       TEXT NOT NULL,
  sequence     BIGINT NOT NULL,
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lot_id, sequence)
);

CREATE INDEX auction_events_lot_id_idx ON auction_events (lot_id, sequence);

CREATE TABLE lot_status (
  lot_id              TEXT PRIMARY KEY,
  status              TEXT NOT NULL,
  current_highest_bid NUMERIC(12,2),
  bid_count           INT NOT NULL DEFAULT 0,
  end_at              TIMESTAMPTZ NOT NULL,
  winner_user_id      TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE bids (
  id         TEXT PRIMARY KEY,
  lot_id     TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  amount     NUMERIC(12,2) NOT NULL,
  placed_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX bids_lot_id_idx ON bids (lot_id, placed_at DESC);

-- ── Payment service ───────────────────────────────────────────────────────────
\c payment_test

CREATE TABLE invoices (
  id                    UUID PRIMARY KEY,
  lot_id                UUID NOT NULL,
  winner_user_id        UUID NOT NULL,
  amount                NUMERIC(12,2) NOT NULL,
  currency              TEXT NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('AWAITING_PAYMENT','PAID','EXPIRED','CANCELLED')),
  stripe_checkout_id    TEXT,
  stripe_payment_intent TEXT,
  due_at                TIMESTAMPTZ NOT NULL,
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id       UUID REFERENCES invoices(id),
  stripe_event_id  TEXT UNIQUE NOT NULL,
  event_type       TEXT NOT NULL,
  payload          JSONB NOT NULL,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX invoices_winner_user_id_idx ON invoices (winner_user_id);
CREATE INDEX invoices_lot_id_idx ON invoices (lot_id);

-- ── Shipping service ──────────────────────────────────────────────────────────
\c shipping_test

CREATE TABLE fulfilments (
  id              UUID PRIMARY KEY,
  lot_id          UUID NOT NULL,
  user_id         UUID NOT NULL,
  method          TEXT,
  status          TEXT NOT NULL,
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
  country         TEXT NOT NULL
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

-- ── Notification service ──────────────────────────────────────────────────────
\c notification_test

CREATE TABLE IF NOT EXISTS notification_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  type        TEXT NOT NULL,
  channel     TEXT NOT NULL CHECK (channel IN ('EMAIL', 'SMS')),
  status      TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED')),
  error       TEXT,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_log_user_id ON notification_log(user_id);
CREATE INDEX idx_notification_log_created_at ON notification_log(created_at);

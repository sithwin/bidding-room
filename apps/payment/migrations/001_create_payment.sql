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

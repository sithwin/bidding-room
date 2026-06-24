CREATE TABLE IF NOT EXISTS payment_profiles (
  user_id                  UUID PRIMARY KEY,
  stripe_customer_id       TEXT NOT NULL,
  stripe_payment_method_id TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

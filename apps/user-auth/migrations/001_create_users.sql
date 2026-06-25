CREATE TABLE users (
  id              UUID PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  phone           TEXT,
  status          TEXT NOT NULL DEFAULT 'REGISTERED',
  -- REGISTERED | EMAIL_VERIFIED | APPROVED_BIDDER | SUSPENDED
  role            TEXT NOT NULL DEFAULT 'BUYER',
  -- BUYER | ADMIN
  country         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE verification_tokens (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL,  -- EMAIL | PHONE
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

ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_document_key TEXT;

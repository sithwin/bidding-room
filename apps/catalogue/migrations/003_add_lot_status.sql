-- Lot's own availability flag (Active/Inactive), owned by catalogue.
-- Distinct from auction-engine's event-sourced per-lot auction status.
ALTER TABLE lots
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE'));

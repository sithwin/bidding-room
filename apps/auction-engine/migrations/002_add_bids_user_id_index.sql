-- Supports GET /api/account/bids and /api/account/stats, which filter and
-- aggregate the bids read-model by user_id across all lots.
CREATE INDEX IF NOT EXISTS bids_user_id_idx ON bids (user_id, placed_at DESC);

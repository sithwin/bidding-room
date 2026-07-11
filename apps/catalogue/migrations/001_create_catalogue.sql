CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS categories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  parent_id     UUID REFERENCES categories(id),
  display_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lots (
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

CREATE TABLE IF NOT EXISTS lot_images (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lot_id        UUID NOT NULL REFERENCES lots(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS lots_search_idx ON lots USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS lot_images_lot_id_idx ON lot_images(lot_id);

CREATE OR REPLACE FUNCTION lots_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER lots_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, description ON lots
  FOR EACH ROW EXECUTE FUNCTION lots_search_vector_update();

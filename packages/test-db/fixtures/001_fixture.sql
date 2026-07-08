CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE widgets (
  id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name  TEXT NOT NULL,
  blurb TSVECTOR
);

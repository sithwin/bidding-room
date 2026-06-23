import postgres from 'postgres';

export function createPostgresClient(url: string) {
  return postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 30,
  });
}

export type PostgresClient = ReturnType<typeof createPostgresClient>;

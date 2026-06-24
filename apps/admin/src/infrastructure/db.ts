import postgres from 'postgres';

export type Db = ReturnType<typeof postgres>;

export function createDb(connectionUrl: string): Db {
  return postgres(connectionUrl);
}

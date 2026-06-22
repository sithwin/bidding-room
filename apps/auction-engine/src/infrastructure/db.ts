import postgres from 'postgres';

export type Db = ReturnType<typeof postgres>;

export function createDb(url: string): Db {
  return postgres(url);
}

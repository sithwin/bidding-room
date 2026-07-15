export const SERVICE_URLS = {
  userAuth: process.env.USER_SERVICE_URL ?? 'http://localhost:3001',
  catalogue: process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002',
  auction: process.env.AUCTION_ENGINE_URL ?? 'http://localhost:3003',
  payment: process.env.PAYMENT_SERVICE_URL ?? 'http://localhost:3004',
  shipping: process.env.SHIPPING_SERVICE_URL ?? 'http://localhost:3006',
} as const;

export const USER_PORTAL_PORT = Number(process.env.USER_PORTAL_PORT ?? 3000);
export const ADMIN_PORTAL_PORT = Number(process.env.ADMIN_PORTAL_PORT ?? 3008);

export const SEED_DB_URL =
  process.env.SEED_USER_DB_URL ?? 'postgresql://carat:carat_test@localhost:5433/user_test';

let counter = 0;

export function uniqueSuffix(): string {
  counter += 1;
  return `${process.pid}-${counter}`;
}

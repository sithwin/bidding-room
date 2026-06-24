/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    USER_SERVICE_URL:      process.env.USER_SERVICE_URL      ?? 'http://localhost:3001',
    CATALOGUE_SERVICE_URL: process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002',
    AUCTION_SERVICE_URL:   process.env.AUCTION_SERVICE_URL   ?? 'http://localhost:3003',
    PAYMENT_SERVICE_URL:   process.env.PAYMENT_SERVICE_URL   ?? 'http://localhost:3004',
    SHIPPING_SERVICE_URL:  process.env.SHIPPING_SERVICE_URL  ?? 'http://localhost:3006',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  },
  images: { domains: ['pub-placeholder.r2.dev'] },
};

export default nextConfig;

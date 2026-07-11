/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    USER_SERVICE_URL:      process.env.USER_SERVICE_URL      ?? 'http://localhost:3001',
    CATALOGUE_SERVICE_URL: process.env.CATALOGUE_SERVICE_URL ?? 'http://localhost:3002',
    // http fallback is intentional: private Docker-network traffic; TLS terminates at the Nginx edge
    AUCTION_ENGINE_URL:    process.env.AUCTION_ENGINE_URL    ?? 'http://auction-engine:3003', // NOSONAR
    PAYMENT_SERVICE_URL:   process.env.PAYMENT_SERVICE_URL   ?? 'http://localhost:3004',
    SHIPPING_SERVICE_URL:  process.env.SHIPPING_SERVICE_URL  ?? 'http://localhost:3006',
    ADMIN_SERVICE_URL:     process.env.ADMIN_SERVICE_URL     ?? 'http://localhost:3007',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-placeholder.r2.dev',
      },
    ],
  },
};

export default nextConfig;

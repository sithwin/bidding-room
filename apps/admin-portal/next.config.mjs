/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    ADMIN_SERVICE_URL: process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3007',
    USER_SERVICE_URL: process.env.USER_SERVICE_URL ?? 'http://localhost:3001',
  },
};

export default nextConfig;

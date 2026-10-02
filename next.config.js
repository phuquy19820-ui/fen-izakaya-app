/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Nếu chạy trên port khác 3000
  serverRuntimeConfig: {
    apiUrl: process.env.API_URL || 'http://localhost:5000'
  }
};

module.exports = nextConfig;

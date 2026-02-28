import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  
  // TypeScript: strict mode enabled for type safety
  // Run `npx tsc --noEmit` to check for errors before build
  typescript: {
    // ignoreBuildErrors: false is default - removed for safety
  },
  
  // React Strict Mode helps catch potential problems
  reactStrictMode: true,
  
  // CORS configuration for API routes
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
    
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: isProd 
              ? (allowedOrigins.length > 0 ? allowedOrigins.join(',') : 'https://citarion.app')
              : '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, X-API-Key, X-Webhook-Signature, X-Client-Id',
          },
          {
            key: 'Access-Control-Max-Age',
            value: '86400', // 24 hours
          },
        ],
      },
    ];
  },
};

export default nextConfig;

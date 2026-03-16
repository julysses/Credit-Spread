import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Required for Docker/Fly.io deployment
  experimental: {
    serverComponentsExternalPackages: ["postgres", "drizzle-orm"],
  },
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    ALPHA_VANTAGE_API_KEY: process.env.ALPHA_VANTAGE_API_KEY,
    POLYGON_API_KEY: process.env.POLYGON_API_KEY,
    TRADIER_API_KEY: process.env.TRADIER_API_KEY,
    NEWS_API_KEY: process.env.NEWS_API_KEY,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_FROM: process.env.TWILIO_PHONE_FROM,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
  // Ensure recharts and other client libs bundle correctly
  transpilePackages: ["recharts"],
};

export default nextConfig;

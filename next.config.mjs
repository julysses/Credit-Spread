

const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["postgres", "drizzle-orm"],
  },
  // Only expose non-sensitive, public config to the client bundle.
  // All API keys stay server-side only (accessed in /server/ and /app/api/).
  env: {
    NEXT_PUBLIC_APP_NAME: "SPX Signal Desk",
    NEXT_PUBLIC_APP_VERSION: "1.0.0",
  },
  transpilePackages: ["recharts"],
};

export default nextConfig;

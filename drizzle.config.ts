import type { Config } from 'drizzle-kit';

export default {
  schema: './database/schema.ts',
  out: './database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;

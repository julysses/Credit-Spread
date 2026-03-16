import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// Prevent multiple connections in development (hot reload)
declare global {
  // eslint-disable-next-line no-var
  var _pgClient: ReturnType<typeof postgres> | undefined;
}

let client: ReturnType<typeof postgres>;
if (process.env.NODE_ENV === 'production') {
  client = postgres(connectionString, { max: 10 });
} else {
  if (!global._pgClient) {
    global._pgClient = postgres(connectionString, { max: 5 });
  }
  client = global._pgClient;
}

export const db = drizzle(client, { schema });
export type DB = typeof db;

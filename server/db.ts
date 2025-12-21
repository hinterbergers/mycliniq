import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Configure WebSocket for Neon database
neonConfig.webSocketConstructor = ws;

// Get and sanitize DATABASE_URL
function getDatabaseUrl(): string {
  let dbUrl = process.env.DATABASE_URL || '';
  
  // Fix malformed DATABASE_URL (e.g., "psql 'postgresql://...'")
  if (dbUrl.startsWith("psql ")) {
    dbUrl = dbUrl.replace(/^psql\s+['"]?/, '').replace(/['"]$/, '');
  }
  
  // Build from individual PG variables if still invalid
  if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    const host = process.env.PGHOST;
    const port = process.env.PGPORT || '5432';
    const user = process.env.PGUSER;
    const password = process.env.PGPASSWORD;
    const database = process.env.PGDATABASE;
    
    if (host && user && password && database) {
      dbUrl = `postgresql://${user}:${password}@${host}:${port}/${database}?sslmode=require`;
    }
  }
  
  return dbUrl;
}

// Database setup
const connectionString = getDatabaseUrl();
const pool = new Pool({ connectionString });
export const db = drizzle(pool);

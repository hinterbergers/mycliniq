/**
 * Database client export
 * Re-exports the Drizzle database instance for use in API routes
 */
export { db } from "../db";

// Re-export commonly used Drizzle operators
export {
  eq,
  and,
  or,
  gte,
  lte,
  ne,
  desc,
  asc,
  isNull,
  isNotNull,
  inArray,
  sql,
} from "drizzle-orm";

import { createConnection } from "mysql2/promise";
import "dotenv/config";
const c = await createConnection({ uri: process.env.DATABASE_URL });

// 1. Show what IN (?) does with an array directly
try {
  const [r] = await c.execute(
    "SELECT id FROM leads WHERE LOWER(TRIM(property_address)) IN (?)",
    [["29 Arlington St", "96 Chapin St", "78-80 Pearl St"]]
  );
  console.log("Result count:", r.length, "(should be 3)");
} catch (e) { console.error("IN error:", e.message); }

await c.end();

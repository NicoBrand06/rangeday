import "server-only";
import { createClient, type Client } from "@libsql/client";
import { createTables } from "./schema";
import { seed } from "./seed";
import { addDays, clubNow } from "./time";

// Locally: a SQLite file in the project folder, no setup needed.
// On Vercel: a free hosted Turso database (same SQLite, over the network).
const url = process.env.TURSO_DATABASE_URL || "file:rangeday.db";

const g = globalThis as unknown as { rdClient?: Client; rdReady?: Promise<void> };
const client = g.rdClient ?? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
g.rdClient = client;

/**
 * Returns the database, creating tables and demo data the first time.
 * Demo data is refreshed automatically once it is more than 7 days old,
 * so the live demo always has bookings around "today".
 */
export async function getDb(): Promise<Client> {
  g.rdReady ??= (async () => {
    await createTables(client);
    const row = (await client.execute("SELECT value FROM meta WHERE key = 'seeded_on'")).rows[0];
    const seededOn = row ? String(row.value) : null;
    if (!seededOn || seededOn < addDays(clubNow().date, -7)) await seed(client);
  })().catch((e) => {
    g.rdReady = undefined;
    throw e;
  });
  await g.rdReady;
  return client;
}

export async function resetDemoData() {
  const db = await getDb();
  await seed(db);
}

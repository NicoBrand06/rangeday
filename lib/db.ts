import "server-only";
import type { Client } from "@libsql/client";
import { createTables } from "./schema";
import { seed } from "./seed";
import { addDays, clubNow } from "./time";

// Locally: a SQLite file in the project folder, no setup needed.
// On Vercel: a free hosted Turso database (same SQLite, over the network).
// .trim() guards against stray spaces or line breaks pasted into the settings.
const url = process.env.TURSO_DATABASE_URL?.trim() || "file:rangeday.db";
const authToken = process.env.TURSO_AUTH_TOKEN?.trim() || undefined;

const g = globalThis as unknown as { rdClient?: Promise<Client>; rdReady?: Promise<void> };

/**
 * The connection is created on first use, not when the file loads, so a bad setting
 * shows up as a clear error message in the logs instead of crashing every page.
 * For Turso we use the "web" client, which talks plain HTTPS and needs no native
 * driver, the best fit for serverless hosting like Vercel.
 */
function connect(): Promise<Client> {
  g.rdClient ??= (async () => {
    if (url.startsWith("file:")) {
      if (process.env.VERCEL) {
        throw new Error("TURSO_DATABASE_URL is not set. Vercel can't keep a local database file; add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel → Settings → Environment Variables, then redeploy.");
      }
      const { createClient } = await import("@libsql/client");
      return createClient({ url });
    }
    if (!/^(libsql|https):\/\//.test(url)) {
      throw new Error(`TURSO_DATABASE_URL should start with libsql:// (got "${url.slice(0, 12)}…")`);
    }
    if (!authToken) throw new Error("TURSO_AUTH_TOKEN is missing. Add it in Vercel → Settings → Environment Variables.");
    const { createClient } = await import("@libsql/client/web");
    return createClient({ url, authToken });
  })().catch((e) => {
    g.rdClient = undefined;
    throw e;
  });
  return g.rdClient;
}

/**
 * Returns the database, creating tables and demo data the first time.
 * Demo data is refreshed automatically once it is more than 7 days old,
 * so the live demo always has bookings around "today".
 */
export async function getDb(): Promise<Client> {
  const client = await connect();
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

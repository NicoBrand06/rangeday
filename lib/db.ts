import "server-only";
import type { Client } from "@libsql/client";
import { DEFAULTS, getConfig } from "./config";
import { dropAll, migrate } from "./schema";
import { seedClub, seedDemo } from "./seed";
import { addDays, clubNow } from "./time";

/** DEMO_MODE=true: demo logins, synthetic members and a weekly refresh. Off for a real club. */
export function demoMode() {
  return process.env.DEMO_MODE?.trim().toLowerCase() === "true";
}

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
 * Returns the database, bringing its structure up to date first (migrations).
 * - A brand-new database gets the club's starting setup (settings, areas, events, shop).
 * - In demo mode only, synthetic members and bookings are added and refreshed weekly
 *   so the public demo always has activity around "today".
 * Outside demo mode nothing is ever wiped automatically.
 */
export async function getDb(): Promise<Client> {
  const client = await connect();
  g.rdReady ??= (async () => {
    const isNew = await migrate(client);
    const today = clubNow((await getConfig(client).catch(() => DEFAULTS)).timezone).date;
    if (isNew) await seedClub(client, today);
    if (demoMode()) {
      const row = (await client.execute("SELECT value FROM meta WHERE key = 'demo_seeded_on'")).rows[0];
      if (!row) await seedDemo(client, clubNow((await getConfig(client)).timezone));
      else if (String(row.value) < addDays(today, -7)) await rebuildDemo(client);
    }
  })().catch((e) => {
    g.rdReady = undefined;
    throw e;
  });
  await g.rdReady;
  return client;
}

async function rebuildDemo(db: Client) {
  await dropAll(db);
  await migrate(db);
  const now = clubNow(DEFAULTS.timezone);
  await seedClub(db, now.date);
  await seedDemo(db, now);
}

/** Demo mode only: wipe everything and start again with fresh demo data. */
export async function resetDemoData() {
  if (!demoMode()) throw new Error("Reset is only available in demo mode.");
  await rebuildDemo(await getDb());
}

import "server-only";
import { cache } from "react";
import { getConfig } from "./config";
import { getDb } from "./db";
import { clubNow } from "./time";

/** The database, club settings and the club's current time, loaded once per request. */
export const getCtx = cache(async () => {
  const db = await getDb();
  const cfg = await getConfig(db);
  return { db, cfg, now: clubNow(cfg.timezone) };
});

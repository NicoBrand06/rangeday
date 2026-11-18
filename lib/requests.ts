import type { Client } from "@libsql/client";
import type { Result } from "./booking";
import type { ClubConfig } from "./config";

// "Let the shop know": one-way, non-urgent requests and problem reports from members
// to pro shop staff ("Trap launcher is out of clays"). There are no replies: members only
// see the status, and anything that needs a conversation is a phone call.
// Requests are never deleted (a database trigger refuses it), so staff can spot patterns.

export type RequestType = "equipment" | "help" | "other";
export type RequestStatus = "open" | "in_progress" | "done";

export const REQUEST_TYPES: Record<RequestType, string> = { equipment: "Equipment issue", help: "Need help", other: "Other" };
export const REQUEST_STATUS: Record<RequestStatus, [label: string, tone: string]> = {
  open: ["Open", "amber"],
  in_progress: ["In progress", ""],
  done: ["Done", "green"],
};
export const MAX_NOTE = 300;
/** A member can have this many requests not yet done, so one person can't flood the queue. */
export const MAX_OPEN_PER_MEMBER = 5;

export type ShopRequest = {
  id: number;
  user_id: number;
  member_name: string;
  member_no: string;
  activity: string;
  type: RequestType;
  note: string;
  status: RequestStatus;
  created_at: string; // UTC, "YYYY-MM-DD HH:MM:SS"
  started_at: string | null;
  started_by_name: string | null;
  done_at: string | null;
  done_by_name: string | null;
};

const SELECT = `
  SELECT r.id, r.user_id, u.name AS member_name, u.member_no, r.activity, r.type, r.note, r.status, r.created_at,
         r.started_at, s.name AS started_by_name, r.done_at, d.name AS done_by_name
  FROM shop_requests r
  JOIN users u ON u.id = r.user_id
  LEFT JOIN users s ON s.id = r.started_by
  LEFT JOIN users d ON d.id = r.done_by`;

export function isRequestType(t: string): t is RequestType {
  return t in REQUEST_TYPES;
}
export function isRequestStatus(s: string): s is RequestStatus {
  return s in REQUEST_STATUS;
}

export async function createRequest(
  db: Client,
  cfg: Pick<ClubConfig, "activities">,
  input: { userId: number; activity: string; type: string; note: string },
): Promise<Result<{ id: number }>> {
  const note = input.note.replace(/\s+/g, " ").trim();
  if (!cfg.activities.some((a) => a.key === input.activity && a.active)) return { ok: false, error: "Pick the area this is about." };
  if (!isRequestType(input.type)) return { ok: false, error: "Pick what kind of request this is." };
  if (!note) return { ok: false, error: "Add a short note so staff know what's needed." };
  if (note.length > MAX_NOTE) return { ok: false, error: `Keep the note to ${MAX_NOTE} characters. For anything longer, call the shop.` };

  // Check the open-request limit and save in one statement, so a double-tap can't get past it.
  const r = await db.execute({
    sql: `INSERT INTO shop_requests (user_id, activity, type, note)
          SELECT ?, ?, ?, ?
          WHERE (SELECT count(*) FROM shop_requests WHERE user_id = ? AND status != 'done') < ?`,
    args: [input.userId, input.activity, input.type, note, input.userId, MAX_OPEN_PER_MEMBER],
  });
  if (!r.rowsAffected)
    return { ok: false, error: `You have ${MAX_OPEN_PER_MEMBER} requests the shop hasn't finished yet. Please wait for those, or call the shop.` };
  return { ok: true, id: Number(r.lastInsertRowid) };
}

/**
 * Staff move a request forward: Open -> In progress -> Done, or straight from Open to Done.
 * Records who did it and when. Never goes backwards, so the log stays honest.
 */
export async function setRequestStatus(db: Client, id: number, to: string, staffId: number): Promise<Result> {
  if (to === "in_progress") {
    const r = await db.execute({
      sql: "UPDATE shop_requests SET status = 'in_progress', started_by = ?, started_at = datetime('now') WHERE id = ? AND status = 'open'",
      args: [staffId, id],
    });
    if (r.rowsAffected) return { ok: true };
  } else if (to === "done") {
    // Going straight from Open to Done counts the same person as having started it.
    const r = await db.execute({
      sql: `UPDATE shop_requests SET status = 'done', done_by = ?, done_at = datetime('now'),
              started_by = coalesce(started_by, ?), started_at = coalesce(started_at, datetime('now'))
            WHERE id = ? AND status IN ('open','in_progress')`,
      args: [staffId, staffId, id],
    });
    if (r.rowsAffected) return { ok: true };
  } else {
    return { ok: false, error: "Unknown status." };
  }
  const cur = await db.execute({ sql: "SELECT status FROM shop_requests WHERE id = ?", args: [id] });
  if (!cur.rows[0]) return { ok: false, error: "That request no longer exists." };
  const label = REQUEST_STATUS[String(cur.rows[0].status) as RequestStatus][0];
  return { ok: false, error: `That request is already ${label.toLowerCase()}. Someone may have just updated it.` };
}

export async function memberRequests(db: Client, userId: number, limit = 20): Promise<ShopRequest[]> {
  const rs = await db.execute({ sql: `${SELECT} WHERE r.user_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT ?`, args: [userId, limit] });
  return rs.rows as unknown as ShopRequest[];
}

export async function requestQueue(db: Client, filter: { status?: RequestStatus; activity?: string } = {}, limit = 200): Promise<ShopRequest[]> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (filter.status) {
    where.push("r.status = ?");
    args.push(filter.status);
  }
  if (filter.activity) {
    where.push("r.activity = ?");
    args.push(filter.activity);
  }
  const rs = await db.execute({
    sql: `${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY r.created_at DESC, r.id DESC LIMIT ?`,
    args: [...args, limit],
  });
  return rs.rows as unknown as ShopRequest[];
}

/** Counts by status, plus a per-area count of all requests, for spotting patterns. */
export async function requestCounts(db: Client): Promise<{ byStatus: Record<RequestStatus, number>; byArea: Record<string, number> }> {
  const [s, a] = await Promise.all([
    db.execute("SELECT status, count(*) AS n FROM shop_requests GROUP BY status"),
    db.execute("SELECT activity, count(*) AS n FROM shop_requests GROUP BY activity"),
  ]);
  const byStatus: Record<RequestStatus, number> = { open: 0, in_progress: 0, done: 0 };
  for (const r of s.rows) byStatus[String(r.status) as RequestStatus] = Number(r.n);
  const byArea: Record<string, number> = {};
  for (const r of a.rows) byArea[String(r.activity)] = Number(r.n);
  return { byStatus, byArea };
}

/** "2026-11-17 14:05:00" (UTC) -> "Tue 9:05 AM" in club time. */
export function requestTime(sqlUtc: string, timeZone: string): string {
  return new Date(sqlUtc.replace(" ", "T") + "Z").toLocaleString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

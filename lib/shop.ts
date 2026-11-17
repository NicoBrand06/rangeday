import type { Client } from "@libsql/client";
import type { Result } from "./booking";
import type { ClubConfig } from "./config";

// Reserve for pickup. There is no live stock count and no payment:
// a reservation is a request. Staff check the shelf, then confirm or decline,
// and the member sees the status. Payment happens at the counter.
// Requests and holds expire after cfg.reservationExpiryDays (see expireStale).

export type Item = { id: number; name: string; category: string; detail: string; price_cents: number; active: number };
export type ReservationStatus = "pending" | "confirmed" | "declined" | "cancelled" | "picked_up" | "expired";
type Expiry = Pick<ClubConfig, "reservationExpiryDays">;
export type Reservation = {
  id: number;
  item_id: number;
  user_id: number;
  quantity: number;
  status: ReservationStatus;
  staff_note: string | null;
  created_at: string;
  confirmed_at: string | null;
  updated_at: string;
  item_name: string;
  item_detail: string;
  price_cents: number;
  member_name: string;
  member_no: string;
};

export const CATEGORIES = ["Ammunition", "Apparel", "Accessories"];
export const MAX_QTY = 10;
export const OPEN: ReservationStatus[] = ["pending", "confirmed"];

export const STATUS_LABEL: Record<ReservationStatus, [string, string]> = {
  pending: ["Waiting for staff", "amber"],
  confirmed: ["Ready for pickup", "green"],
  declined: ["Declined", "red"],
  cancelled: ["Cancelled", ""],
  picked_up: ["Picked up", ""],
  expired: ["Expired", ""],
};

/**
 * Expire stale requests: unanswered ones X days after they were made, and confirmed
 * holds X days after confirmation if nobody picked them up. Runs whenever reservations
 * are read, so no scheduled job is needed.
 */
export async function expireStale(db: Client, cfg: Expiry) {
  const age = `-${Math.max(1, cfg.reservationExpiryDays)} days`;
  await db.batch(
    [
      { sql: "UPDATE reservations SET status = 'expired', updated_at = datetime('now') WHERE status = 'pending' AND created_at < datetime('now', ?)", args: [age] },
      { sql: "UPDATE reservations SET status = 'expired', updated_at = datetime('now') WHERE status = 'confirmed' AND coalesce(confirmed_at, created_at) < datetime('now', ?)", args: [age] },
    ],
    "write",
  );
}

/** When an open reservation will expire, as a SQLite UTC timestamp. */
export function expiresAt(r: Pick<Reservation, "status" | "created_at" | "confirmed_at">, cfg: Expiry): Date | null {
  if (r.status !== "pending" && r.status !== "confirmed") return null;
  const from = r.status === "confirmed" ? (r.confirmed_at ?? r.created_at) : r.created_at;
  return new Date(new Date(from.replace(" ", "T") + "Z").getTime() + cfg.reservationExpiryDays * 86_400_000);
}

export function price(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function listItems(db: Client, category?: string, q?: string, includeHidden = false): Promise<Item[]> {
  const where: string[] = includeHidden ? [] : ["active = 1"];
  const args: string[] = [];
  if (category) {
    where.push("category = ?");
    args.push(category);
  }
  if (q) {
    where.push("(name LIKE ? OR detail LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }
  const rs = await db.execute({ sql: `SELECT * FROM items ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY CASE category WHEN 'Ammunition' THEN 0 WHEN 'Apparel' THEN 1 ELSE 2 END, id`, args });
  return rs.rows as unknown as Item[];
}

export async function getItem(db: Client, id: number): Promise<Item | null> {
  return ((await db.execute({ sql: "SELECT * FROM items WHERE id = ?", args: [id] })).rows[0] as unknown as Item) ?? null;
}

const SELECT = `SELECT r.*, i.name AS item_name, i.detail AS item_detail, i.price_cents,
  u.name AS member_name, u.member_no
  FROM reservations r JOIN items i ON i.id = r.item_id JOIN users u ON u.id = r.user_id`;

export async function getReservation(db: Client, id: number): Promise<Reservation | null> {
  return ((await db.execute({ sql: `${SELECT} WHERE r.id = ?`, args: [id] })).rows[0] as unknown as Reservation) ?? null;
}

export async function reservationsFor(db: Client, cfg: Expiry, userId: number): Promise<Reservation[]> {
  await expireStale(db, cfg);
  const rs = await db.execute({ sql: `${SELECT} WHERE r.user_id = ? ORDER BY r.id DESC`, args: [userId] });
  return rs.rows as unknown as Reservation[];
}

/** Staff queue: pending first (oldest first, so nobody waits too long), then confirmed. */
export async function openReservations(db: Client, cfg: Expiry): Promise<Reservation[]> {
  await expireStale(db, cfg);
  const rs = await db.execute(
    `${SELECT} WHERE r.status IN ('pending','confirmed') ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.id`,
  );
  return rs.rows as unknown as Reservation[];
}

export async function recentlyClosedReservations(db: Client, limit = 8): Promise<Reservation[]> {
  const rs = await db.execute({
    sql: `${SELECT} WHERE r.status IN ('declined','cancelled','picked_up','expired') ORDER BY r.updated_at DESC, r.id DESC LIMIT ?`,
    args: [limit],
  });
  return rs.rows as unknown as Reservation[];
}

export async function reserveItem(db: Client, userId: number, itemId: number, quantity: number): Promise<Result<{ id: number }>> {
  const item = await getItem(db, itemId);
  if (!item || !Number(item.active)) return { ok: false, error: "That item isn't available to reserve right now." };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY)
    return { ok: false, error: `You can reserve 1 to ${MAX_QTY} at a time. For bigger orders, talk to the pro shop.` };
  const existing = await db.execute({
    sql: "SELECT 1 FROM reservations WHERE user_id = ? AND item_id = ? AND status IN ('pending','confirmed')",
    args: [userId, itemId],
  });
  if (existing.rows.length) return { ok: false, error: "You already have this item on hold. Cancel that one first to change the quantity." };
  const rs = await db.execute({
    sql: "INSERT INTO reservations (user_id,item_id,quantity) VALUES (?,?,?)",
    args: [userId, itemId, quantity],
  });
  return { ok: true, id: Number(rs.lastInsertRowid) };
}

/** Members can withdraw a request while it's waiting or ready for pickup. */
export async function cancelReservation(db: Client, id: number, userId: number): Promise<Result> {
  const r = await getReservation(db, id);
  if (!r || r.user_id !== userId) return { ok: false, error: "Reservation not found." };
  if (!OPEN.includes(r.status)) return { ok: false, error: "This reservation is already closed." };
  await db.execute({ sql: "UPDATE reservations SET status='cancelled', updated_at=datetime('now') WHERE id = ?", args: [id] });
  return { ok: true };
}

// Which status changes staff are allowed to make.
const STAFF_MOVES: Record<string, ReservationStatus[]> = {
  pending: ["confirmed", "declined"],
  confirmed: ["picked_up", "declined"],
};

export async function staffUpdateReservation(db: Client, cfg: Expiry, id: number, to: ReservationStatus, note?: string): Promise<Result> {
  await expireStale(db, cfg);
  const r = await getReservation(db, id);
  if (!r) return { ok: false, error: "Reservation not found." };
  if (!(STAFF_MOVES[r.status] ?? []).includes(to))
    return { ok: false, error: `Can't change a ${STATUS_LABEL[r.status][0].toLowerCase()} reservation to ${to.replace("_", " ")}.` };
  await db.execute({
    sql: `UPDATE reservations SET status = ?1, staff_note = COALESCE(?2, staff_note), updated_at = datetime('now'),
            confirmed_at = CASE WHEN ?1 = 'confirmed' THEN datetime('now') ELSE confirmed_at END
          WHERE id = ?3 AND status = ?4`,
    args: [to, note?.trim() || null, id, r.status],
  });
  return { ok: true };
}

// ---- Staff catalogue (Settings → Pro shop) ----

export type ItemInput = { name: string; category: string; detail: string; price: string };

export async function saveItem(db: Client, id: number | null, input: ItemInput): Promise<Result<{ id: number }>> {
  const name = input.name.trim();
  const detail = input.detail.trim();
  const cents = Math.round(Number(input.price.replace(/[$,\s]/g, "")) * 100);
  if (!name || name.length > 80) return { ok: false, error: "Give the item a name." };
  if (!CATEGORIES.includes(input.category)) return { ok: false, error: "Pick a category." };
  if (detail.length > 60) return { ok: false, error: "Keep the detail short (pack size, sizes...)." };
  if (!Number.isFinite(cents) || cents < 0 || cents > 1_000_000) return { ok: false, error: "Enter a price, e.g. 11.99." };
  if (id) {
    await db.execute({ sql: "UPDATE items SET name=?, category=?, detail=?, price_cents=? WHERE id=?", args: [name, input.category, detail, cents, id] });
    return { ok: true, id };
  }
  const rs = await db.execute({ sql: "INSERT INTO items (name,category,detail,price_cents) VALUES (?,?,?,?)", args: [name, input.category, detail, cents] });
  return { ok: true, id: Number(rs.lastInsertRowid) };
}

/** Items are hidden, never deleted, so past reservations keep their history. */
export async function setItemActive(db: Client, id: number, active: boolean) {
  await db.execute({ sql: "UPDATE items SET active = ? WHERE id = ?", args: [active ? 1 : 0, id] });
}

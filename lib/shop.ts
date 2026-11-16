import type { Client } from "@libsql/client";
import type { Result } from "./booking";

// Reserve for pickup. There is no live stock count and no payment:
// a reservation is a request. Staff check the shelf, then confirm or decline,
// and the member sees the status. Payment happens at the counter.

export type Item = { id: number; name: string; category: string; detail: string; price_cents: number };
export type ReservationStatus = "pending" | "confirmed" | "declined" | "cancelled" | "picked_up";
export type Reservation = {
  id: number;
  item_id: number;
  user_id: number;
  quantity: number;
  status: ReservationStatus;
  staff_note: string | null;
  created_at: string;
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
};

export function price(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function listItems(db: Client, category?: string, q?: string): Promise<Item[]> {
  const where: string[] = [];
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

export async function reservationsFor(db: Client, userId: number): Promise<Reservation[]> {
  const rs = await db.execute({ sql: `${SELECT} WHERE r.user_id = ? ORDER BY r.id DESC`, args: [userId] });
  return rs.rows as unknown as Reservation[];
}

/** Staff queue: pending first (oldest first, so nobody waits too long), then confirmed. */
export async function openReservations(db: Client): Promise<Reservation[]> {
  const rs = await db.execute(
    `${SELECT} WHERE r.status IN ('pending','confirmed') ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.id`,
  );
  return rs.rows as unknown as Reservation[];
}

export async function recentlyClosedReservations(db: Client, limit = 8): Promise<Reservation[]> {
  const rs = await db.execute({
    sql: `${SELECT} WHERE r.status IN ('declined','cancelled','picked_up') ORDER BY r.updated_at DESC, r.id DESC LIMIT ?`,
    args: [limit],
  });
  return rs.rows as unknown as Reservation[];
}

export async function reserveItem(db: Client, userId: number, itemId: number, quantity: number): Promise<Result<{ id: number }>> {
  if (!(await getItem(db, itemId))) return { ok: false, error: "Item not found." };
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

export async function staffUpdateReservation(db: Client, id: number, to: ReservationStatus, note?: string): Promise<Result> {
  const r = await getReservation(db, id);
  if (!r) return { ok: false, error: "Reservation not found." };
  if (!(STAFF_MOVES[r.status] ?? []).includes(to))
    return { ok: false, error: `Can't change a ${STATUS_LABEL[r.status][0].toLowerCase()} reservation to ${to.replace("_", " ")}.` };
  await db.execute({
    sql: "UPDATE reservations SET status = ?, staff_note = COALESCE(?, staff_note), updated_at = datetime('now') WHERE id = ? AND status = ?",
    args: [to, note?.trim() || null, id, r.status],
  });
  return { ok: true };
}

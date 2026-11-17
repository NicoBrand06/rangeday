import Link from "next/link";
import { getCtx } from "@/lib/context";
import { requireUser } from "@/lib/auth";
import { CATEGORIES, listItems, price, reservationsFor } from "@/lib/shop";
import ItemIcon from "@/components/ItemIcon";

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ cat?: string; q?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { db, cfg } = await getCtx();
  const cat = CATEGORIES.includes(sp.cat ?? "") ? sp.cat : undefined;
  const q = sp.q?.trim().slice(0, 60) || undefined;
  const items = await listItems(db, cat, q);
  const open = (await reservationsFor(db, cfg, user.id)).filter((r) => r.status === "pending" || r.status === "confirmed");
  const ready = open.filter((r) => r.status === "confirmed").length;

  return (
    <>
      <div className="bar">
        <h1>Pro Shop</h1>
        <p>Reserve now, pay at pickup</p>
      </div>
      <div className="pad">
        {open.length > 0 && (
          <Link href="/account#reservations" className="card highlight">
            <h3>{open.length} {open.length === 1 ? "reservation" : "reservations"} on hold</h3>
            <p>{ready} ready for pickup · {open.length - ready} waiting for staff</p>
          </Link>
        )}
        <form role="search" action="/shop">
          <label className="sr-only" htmlFor="q">Search the pro shop</label>
          <input id="q" name="q" className="input" defaultValue={q} placeholder="Search shells, vests, eye and ear protection" />
          {cat && <input type="hidden" name="cat" value={cat} />}
        </form>
        <nav className="chips" aria-label="Category" style={{ marginTop: 10 }}>
          <Link href={`/shop${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={`chip ${!cat ? "on" : ""}`}>All</Link>
          {CATEGORIES.map((c) => (
            <Link key={c} href={`/shop?cat=${c}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`chip ${cat === c ? "on" : ""}`}>{c}</Link>
          ))}
        </nav>

        {items.length === 0 && <p className="empty">No items match “{q}”.</p>}
        {items.map((i) => (
          <Link key={i.id} href={`/shop/${i.id}`} className="item">
            <ItemIcon category={i.category} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h4>{i.name}</h4>
              <p>{i.detail}</p>
            </div>
            <span className="muted" style={{ whiteSpace: "nowrap" }}>{price(i.price_cents)}</span>
          </Link>
        ))}
        <p className="note">No live stock count yet. Reserve an item and the pro shop confirms it&apos;s on the shelf. Requests and holds expire after {cfg.reservationExpiryDays} days.</p>
      </div>
    </>
  );
}

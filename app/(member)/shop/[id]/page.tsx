import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MAX_QTY, OPEN, getItem, price, reservationsFor } from "@/lib/shop";
import ItemIcon from "@/components/ItemIcon";
import ReservationCard from "@/components/ReservationCard";
import Stepper from "@/components/Stepper";
import { reserveAction } from "../actions";

export default async function ItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reserved?: string; withdrawn?: string; error?: string }> }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const db = await getDb();
  const item = await getItem(db, Number(id));
  if (!item) notFound();
  const held = (await reservationsFor(db, user.id)).find((r) => r.item_id === item.id && OPEN.includes(r.status));

  return (
    <>
      <div className="bar">
        <Link href="/shop" className="back">‹ Pro Shop</Link>
        <h1>{item.name}</h1>
        <p>{item.category}</p>
      </div>
      <div className="pad">
        {sp.reserved && <p className="note ok" role="status">Reserved. The pro shop will confirm it&apos;s on the shelf; check back here or in Account.</p>}
        {sp.withdrawn && <p className="note ok" role="status">Reservation cancelled.</p>}
        {sp.error && <p className="note error" role="alert">{sp.error}</p>}

        <div className="item" style={{ borderBottom: 0 }}>
          <ItemIcon category={item.category} />
          <div style={{ flex: 1 }}>
            <h4>{item.detail}</h4>
            <p>{price(item.price_cents)} each, paid at pickup</p>
          </div>
        </div>

        {held ? (
          <>
            <div className="lbl">Your reservation</div>
            <ReservationCard r={held} back={`/shop/${item.id}`} />
          </>
        ) : (
          <form action={reserveAction}>
            <input type="hidden" name="item" value={item.id} />
            <Stepper kind="qty" name="qty" max={MAX_QTY} />
            <button className="btn">Reserve for pickup</button>
            <p className="note">
              This sends a request to the pro shop. Staff check the shelf and confirm or decline. You&apos;ll see the status here. Nothing is charged until you collect.
            </p>
          </form>
        )}
      </div>
    </>
  );
}

import type { Reservation } from "@/lib/shop";
import { OPEN, STATUS_LABEL, price } from "@/lib/shop";
import { cancelReservationAction } from "@/app/(member)/shop/actions";

/** A member's view of one reservation and its status. */
export default function ReservationCard({ r, back }: { r: Reservation; back: string }) {
  const [label, tone] = STATUS_LABEL[r.status];
  return (
    <div className={`card ${r.status === "confirmed" ? "highlight" : ""}`}>
      <div className="card-row">
        <h3 className="grow">{r.quantity} × {r.item_name}</h3>
        <span className={`pill ${tone}`}>{label}</span>
      </div>
      <p>{r.item_detail} · {price(r.price_cents * r.quantity)} at pickup · ref PS-{String(r.id).padStart(4, "0")}</p>
      {r.status === "pending" && <p>The pro shop will check the shelf and confirm.</p>}
      {r.status === "confirmed" && <p>Set aside at the pro shop counter. Pay when you collect.</p>}
      {r.staff_note && <p><strong>From the pro shop:</strong> {r.staff_note}</p>}
      {OPEN.includes(r.status) && (
        <form action={cancelReservationAction}>
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="back" value={back} />
          <button className="link-btn">Cancel this reservation</button>
        </form>
      )}
    </div>
  );
}

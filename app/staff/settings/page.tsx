import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { demoMode } from "@/lib/db";
import { MODE_LABEL } from "@/lib/config";
import { CATEGORIES, listItems, price } from "@/lib/shop";
import SubmitButton from "@/components/SubmitButton";
import { activityAction, brandingAction, hoursAction, itemAction, itemActiveAction, policiesAction, stationAction } from "./actions";

const TABS = [
  ["club", "Club"],
  ["hours", "Hours"],
  ["areas", "Areas & fields"],
  ["shop", "Pro shop"],
  ["policies", "Policies"],
] as const;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Search = { tab?: string; msg?: string; error?: string; warn?: string };

export default async function Settings({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  await requireStaff();
  const { db, cfg } = await getCtx();
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "club";
  const stations = (await db.execute("SELECT id, activity, name, capacity, active FROM stations ORDER BY activity, id")).rows as unknown as {
    id: number; activity: string; name: string; capacity: number; active: number;
  }[];

  return (
    <>
      <nav className="chips" aria-label="Settings sections" style={{ marginBottom: 12 }}>
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/staff/settings?tab=${k}`} className={`chip ${tab === k ? "on" : ""}`} aria-current={tab === k ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
      {sp.msg && <p className="note ok" role="status" style={{ marginBottom: 12 }}>{sp.msg}</p>}
      {sp.warn && <p className="note warn" role="alert" style={{ marginBottom: 12 }}>{sp.warn}</p>}
      {sp.error && <p className="note error" role="alert" style={{ marginBottom: 12 }}>{sp.error}</p>}

      {tab === "club" && (
        <section className="panel" style={{ maxWidth: 640 }}>
          <h2>Club name, logo and colours</h2>
          {demoMode() && <p className="note">Locked on the public demo, so visitors can&apos;t rename the club or change its look. A real club can edit these.</p>}
          <form action={brandingAction}>
            <fieldset disabled={demoMode()} style={{ border: 0 }}>
              <label className="field"><span>Club name</span><input className="input" name="clubName" defaultValue={cfg.clubName} required maxLength={60} /></label>
              <label className="field"><span>Tagline</span><input className="input" name="tagline" defaultValue={cfg.tagline} maxLength={80} /></label>
              <div className="row">
                <label className="field" style={{ flex: 1 }}><span>Header colour</span><input type="color" name="primary" defaultValue={cfg.primary} className="input" style={{ padding: 4 }} /></label>
                <label className="field" style={{ flex: 1 }}><span>Button colour</span><input type="color" name="accent" defaultValue={cfg.accent} className="input" style={{ padding: 4 }} /></label>
              </div>
              <label className="field">
                <span>Logo (PNG, SVG, JPG or WebP, up to 200 KB)</span>
                <input type="file" name="logo" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="input" />
              </label>
              {cfg.logo && (
                <div className="row" style={{ marginTop: 8 }}>
                  <img src={cfg.logo} alt="Current logo" width={48} height={48} style={{ objectFit: "contain", background: "#fff", border: "1px solid var(--gm)", borderRadius: 8 }} />
                  <label className="row"><input type="checkbox" name="removeLogo" value="1" /> Remove logo</label>
                </div>
              )}
              <p className="muted" style={{ marginTop: 8 }}>Text colour on the header and buttons is picked automatically for readability. You&apos;ll get a warning if a colour is hard to read.</p>
              <SubmitButton>Save club details</SubmitButton>
            </fieldset>
          </form>
        </section>
      )}

      {tab === "hours" && (
        <section className="panel" style={{ maxWidth: 640 }}>
          <h2>Opening hours</h2>
          <p className="muted" style={{ marginBottom: 8 }}>Booking times are every 30 minutes from opening; the last starts 30 minutes before closing.</p>
          <form action={hoursAction}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Day</th><th>Opens</th><th>Closes</th><th>Closed all day</th></tr></thead>
                <tbody>
                  {cfg.hours.map((h) => (
                    <tr key={h.weekday}>
                      <td>{DAYS[h.weekday]}</td>
                      <td><label className="sr-only" htmlFor={`o${h.weekday}`}>{DAYS[h.weekday]} opens</label><input id={`o${h.weekday}`} type="time" step={1800} name={`open-${h.weekday}`} defaultValue={h.open} className="input" /></td>
                      <td><label className="sr-only" htmlFor={`c${h.weekday}`}>{DAYS[h.weekday]} closes</label><input id={`c${h.weekday}`} type="time" step={1800} name={`close-${h.weekday}`} defaultValue={h.close} className="input" /></td>
                      <td><label className="row"><input type="checkbox" name={`closed-${h.weekday}`} value="1" defaultChecked={h.closed} /> Closed</label></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SubmitButton>Save hours</SubmitButton>
          </form>
        </section>
      )}

      {tab === "areas" && (
        <>
          <section className="panel">
            <h2>Areas and booking types</h2>
            <p className="muted" style={{ marginBottom: 8 }}>
              <strong>Slot-booked:</strong> each party gets its own field per time slot and it can be fully booked.{" "}
              <strong>Shared:</strong> members book a time but share the area, up to the limit per slot.{" "}
              <strong>Walk-around:</strong> no booking; the busy meter uses check-ins and planned visits, and &quot;busy at&quot; sets when it counts as busy.
            </p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name · booking type · people per slot (shared) or &quot;busy at&quot; (walk-around) · shown to members</th></tr></thead>
                <tbody>
                  {cfg.activities.map((a) => (
                    <tr key={a.key}>
                      <td style={{ padding: 0 }}>
                        <form action={activityAction} className="row" style={{ padding: 8, flexWrap: "wrap" }}>
                          <input type="hidden" name="key" value={a.key} />
                          <label className="sr-only" htmlFor={`l-${a.key}`}>Name</label>
                          <input id={`l-${a.key}`} name="label" defaultValue={a.label} className="input" style={{ flex: "1 1 160px", minHeight: 36 }} />
                          <label className="sr-only" htmlFor={`m-${a.key}`}>Booking type</label>
                          <select id={`m-${a.key}`} name="mode" defaultValue={a.mode} className="input" style={{ flex: "1 1 140px", minHeight: 36 }}>
                            {Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          <label className="sr-only" htmlFor={`p-${a.key}`}>People per slot or busy at</label>
                          <input id={`p-${a.key}`} name="perSlot" type="number" min={1} max={500} defaultValue={a.perSlot ?? ""} placeholder="n/a" className="input" style={{ width: 90, minHeight: 36 }} />
                          <label className="sr-only" htmlFor={`a-${a.key}`}>Shown to members</label>
                          <select id={`a-${a.key}`} name="active" defaultValue={a.active ? "1" : "0"} className="input" style={{ width: 100, minHeight: 36 }}>
                            <option value="1">Shown</option><option value="0">Hidden</option>
                          </select>
                          <SubmitButton className="btn small sec" pending="…">Save</SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form action={activityAction} className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
              <label className="field" style={{ flex: "1 1 160px" }}><span>New area</span><input name="label" className="input" placeholder="e.g. Pistol bay" required /></label>
              <label className="field" style={{ flex: "1 1 140px" }}><span>Booking type</span>
                <select name="mode" className="input">{Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
              <label className="field" style={{ width: 120 }}><span>Per slot</span><input name="perSlot" type="number" min={1} max={500} defaultValue={5} className="input" /></label>
              <SubmitButton className="btn small" style={{ alignSelf: "flex-end" }}>+ Add area</SubmitButton>
            </form>
          </section>

          <section className="panel">
            <h2>Fields</h2>
            <p className="muted" style={{ marginBottom: 8 }}>Slot-booked areas need one or more fields. Shared and walk-around areas use one space, created for you. Retiring keeps the field&apos;s history.</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Area · field name · largest party · status</th></tr></thead>
                <tbody>
                  {stations.map((st) => (
                    <tr key={st.id}>
                      <td style={{ padding: 0 }}>
                        <form action={stationAction} className="row" style={{ padding: 8, flexWrap: "wrap" }}>
                          <input type="hidden" name="id" value={st.id} />
                          <span className="muted" style={{ width: 120 }}>{cfg.activities.find((a) => a.key === st.activity)?.label}</span>
                          <label className="sr-only" htmlFor={`sn-${st.id}`}>Field name</label>
                          <input id={`sn-${st.id}`} name="name" defaultValue={st.name} className="input" style={{ flex: "1 1 180px", minHeight: 36 }} />
                          <label className="sr-only" htmlFor={`sc-${st.id}`}>Largest party</label>
                          <input id={`sc-${st.id}`} name="capacity" type="number" min={1} max={20} defaultValue={st.capacity} className="input" style={{ width: 80, minHeight: 36 }} title="Largest party" />
                          <label className="sr-only" htmlFor={`sa-${st.id}`}>Status</label>
                          <select id={`sa-${st.id}`} name="active" defaultValue={Number(st.active) ? "1" : "0"} className="input" style={{ width: 110, minHeight: 36 }}>
                            <option value="1">In use</option><option value="0">Retired</option>
                          </select>
                          <SubmitButton className="btn small sec" pending="…">Save</SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <form action={stationAction} className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
              <label className="field" style={{ flex: "1 1 140px" }}><span>Area</span>
                <select name="activity" className="input">{cfg.activities.filter((a) => a.mode === "slot").map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</select>
              </label>
              <label className="field" style={{ flex: "1 1 180px" }}><span>New field name</span><input name="name" className="input" placeholder="e.g. Trap, Field 3" required /></label>
              <label className="field" style={{ width: 120 }}><span>Largest party</span><input name="capacity" type="number" min={1} max={20} defaultValue={5} className="input" /></label>
              <SubmitButton className="btn small" style={{ alignSelf: "flex-end" }}>+ Add field</SubmitButton>
            </form>
          </section>
        </>
      )}

      {tab === "shop" && <ShopTab />}

      {tab === "policies" && (
        <section className="panel" style={{ maxWidth: 640 }}>
          <h2>Policies</h2>
          <form action={policiesAction}>
            <div className="row">
              <label className="field" style={{ flex: "1 1 200px" }}><span>Members can book this many days ahead</span><input name="bookingDays" type="number" min={1} max={60} defaultValue={cfg.bookingDays} className="input" /></label>
              <label className="field" style={{ flex: "1 1 200px" }}><span>Bookings per member per day</span><input name="maxPerDay" type="number" min={1} max={10} defaultValue={cfg.maxPerDay} className="input" /></label>
            </div>
            <div className="row">
              <label className="field" style={{ flex: "1 1 200px" }}><span>Free cancellation until (the day before)</span><input name="cancelCutoff" type="time" defaultValue={cfg.cancelCutoff} className="input" /></label>
              <label className="field" style={{ flex: "1 1 200px" }}><span>Pickup requests expire after (days)</span><input name="reservationExpiryDays" type="number" min={1} max={30} defaultValue={cfg.reservationExpiryDays} className="input" /></label>
            </div>
            <div className="row">
              <label className="field" style={{ flex: "1 1 200px" }}><span>Walk-around: one round lasts (minutes)</span><input name="roundMinutes" type="number" min={30} max={360} step={30} defaultValue={cfg.roundMinutes} className="input" /></label>
              <label className="field" style={{ flex: "1 1 200px" }}><span>Lesson length</span>
                <select name="lessonMinutes" defaultValue={cfg.lessonMinutes} className="input">{[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} minutes</option>)}</select>
              </label>
            </div>
            <label className="field"><span>Time zone</span><input name="timezone" defaultValue={cfg.timezone} className="input" placeholder="America/New_York" /></label>
            <SubmitButton>Save policies</SubmitButton>
          </form>
        </section>
      )}
    </>
  );
}

async function ShopTab() {
  const { db } = await getCtx();
  const items = await listItems(db, undefined, undefined, true);
  const row = (i?: (typeof items)[number]) => (
    <form action={itemAction} className="row" style={{ padding: 8, flexWrap: "wrap" }}>
      {i && <input type="hidden" name="id" value={i.id} />}
      <label className="sr-only" htmlFor={`in-${i?.id ?? "new"}`}>Name</label>
      <input id={`in-${i?.id ?? "new"}`} name="name" defaultValue={i?.name} placeholder="New item name" className="input" style={{ flex: "2 1 200px", minHeight: 36 }} required />
      <label className="sr-only" htmlFor={`ic-${i?.id ?? "new"}`}>Category</label>
      <select id={`ic-${i?.id ?? "new"}`} name="category" defaultValue={i?.category ?? CATEGORIES[0]} className="input" style={{ flex: "1 1 120px", minHeight: 36 }}>
        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <label className="sr-only" htmlFor={`id-${i?.id ?? "new"}`}>Detail</label>
      <input id={`id-${i?.id ?? "new"}`} name="detail" defaultValue={i?.detail} placeholder="Pack size, sizes…" className="input" style={{ flex: "1 1 140px", minHeight: 36 }} />
      <label className="sr-only" htmlFor={`ip-${i?.id ?? "new"}`}>Price</label>
      <input id={`ip-${i?.id ?? "new"}`} name="price" defaultValue={i ? (i.price_cents / 100).toFixed(2) : ""} placeholder="$" inputMode="decimal" className="input" style={{ width: 90, minHeight: 36 }} required />
      <SubmitButton className={`btn small ${i ? "sec" : ""}`} pending="…">{i ? "Save" : "+ Add"}</SubmitButton>
    </form>
  );
  return (
    <section className="panel">
      <h2>Pro shop items</h2>
      <p className="muted" style={{ marginBottom: 8 }}>No stock counts: members reserve and staff confirm. Hidden items can&apos;t be reserved but keep their history.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Item</th><th style={{ width: 140 }}>Shown</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} style={Number(i.active) ? undefined : { opacity: 0.6 }}>
                <td style={{ padding: 0 }}>{row(i)}</td>
                <td>
                  <form action={itemActiveAction}>
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="active" value={Number(i.active) ? "0" : "1"} />
                    <SubmitButton className="btn small sec" pending="…">{Number(i.active) ? "Hide" : "Show"}</SubmitButton>
                  </form>
                  <span className="muted">{price(i.price_cents)}</span>
                </td>
              </tr>
            ))}
            <tr><td colSpan={2} style={{ padding: 0 }}>{row()}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

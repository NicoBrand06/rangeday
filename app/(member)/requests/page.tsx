import { getCtx } from "@/lib/context";
import { requireUser } from "@/lib/auth";
import { telHref } from "@/lib/admin";
import { MAX_NOTE, MAX_OPEN_PER_MEMBER, REQUEST_STATUS, REQUEST_TYPES, memberRequests, requestTime } from "@/lib/requests";
import { activityLabel } from "@/lib/config";
import NoteField from "@/components/NoteField";
import SubmitButton from "@/components/SubmitButton";
import { sendRequestAction } from "./actions";

export default async function LetTheShopKnow({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const [sp, user] = await Promise.all([searchParams, requireUser()]);
  const { db, cfg } = await getCtx();
  const mine = await memberRequests(db, user.id);
  const areas = cfg.activities.filter((a) => a.active);
  const openCount = mine.filter((r) => r.status !== "done").length;

  return (
    <>
      <div className="bar">
        <h1>Let the shop know</h1>
        <p>Non-urgent requests and problem reports</p>
      </div>
      <div className="pad">
        <a href={telHref(cfg.shopPhone)} className="card urgent">
          <h3>Urgent or safety issue? Call the shop</h3>
          <p><strong>{cfg.shopPhone}</strong>. Tap to call. Don&apos;t use this form for anything that can&apos;t wait.</p>
        </a>

        {sp.sent && <p className="note ok" role="status">Sent. The shop will see it in their queue. Check the status below.</p>}
        {sp.error && <p className="note error" role="alert">{sp.error}</p>}

        {openCount >= MAX_OPEN_PER_MEMBER ? (
          <p className="note">You have {openCount} requests the shop hasn&apos;t finished yet. You can send another once one is done, or call the shop.</p>
        ) : (
          <form action={sendRequestAction}>
            <label className="field">
              <span>Area</span>
              <select name="activity" className="input" required defaultValue="">
                <option value="" disabled>Pick an area</option>
                {areas.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
            </label>
            <fieldset className="field" style={{ border: 0 }}>
              <legend style={{ marginBottom: 6 }}>Type</legend>
              <div className="chips">
                {Object.entries(REQUEST_TYPES).map(([k, label], i) => (
                  <label key={k} className="chip radio-chip">
                    <input type="radio" name="type" value={k} defaultChecked={i === 0} required /> {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <NoteField name="note" max={MAX_NOTE} label="What's needed?" placeholder="e.g. Trap launcher is out of clays" />
            <SubmitButton pending="Sending…">Send to the shop</SubmitButton>
            <p className="note">Staff see your name, the area and your note. There are no replies here: you&apos;ll see the status change to In progress, then Done. If they need to ask you something, they&apos;ll find you or call.</p>
          </form>
        )}

        <div className="lbl" id="mine">My requests</div>
        {mine.length === 0 && <p className="muted">Nothing sent yet.</p>}
        {mine.map((r) => {
          const [label, tone] = REQUEST_STATUS[r.status];
          return (
            <div key={r.id} className="card">
              <div className="card-row">
                <div className="grow">
                  <h3>{activityLabel(cfg, r.activity)} · {REQUEST_TYPES[r.type]}</h3>
                </div>
                <span className={`pill ${tone}`}>{label}</span>
              </div>
              <p>“{r.note}”</p>
              <p>
                Sent {requestTime(r.created_at, cfg.timezone)}
                {r.status === "in_progress" && r.started_at && <> · picked up {requestTime(r.started_at, cfg.timezone)}</>}
                {r.status === "done" && r.done_at && <> · done {requestTime(r.done_at, cfg.timezone)}</>}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}

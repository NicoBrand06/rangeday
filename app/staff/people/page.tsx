import { requireStaff } from "@/lib/auth";
import { getCtx } from "@/lib/context";
import { listPeople, maskEmail } from "@/lib/staff";
import ResetPassword from "@/components/ResetPassword";
import SubmitButton from "@/components/SubmitButton";
import { activeAction, resetPasswordAction, roleAction } from "./actions";

export default async function People({ searchParams }: { searchParams: Promise<{ q?: string; msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await requireStaff();
  const { db } = await getCtx();
  const people = await listPeople(db, sp.q?.slice(0, 60) ?? "");
  const demoStaff = Boolean(Number(me.is_demo));

  return (
    <section className="panel">
      <div className="row" style={{ marginBottom: 10 }}>
        <h2 style={{ marginBottom: 0 }}>People</h2>
        <span className="spacer" />
        <form role="search" action="/staff/people" className="row">
          <label className="sr-only" htmlFor="pq">Search people</label>
          <input id="pq" name="q" className="input" placeholder="Name, email or member #" defaultValue={sp.q} style={{ minHeight: 36, width: 240 }} />
        </form>
      </div>
      {sp.msg && <p className="note ok" role="status">{sp.msg}</p>}
      {sp.error && <p className="note error" role="alert">{sp.error}</p>}
      {demoStaff && (
        <p className="note" style={{ marginBottom: 10 }}>
          You&apos;re using the shared demo staff login, so emails are partly hidden and real sign-ups can&apos;t be changed from here.
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Member #</th><th>Role</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {people.length === 0 && <tr><td colSpan={6} className="empty">Nobody matches.</td></tr>}
            {people.map((p) => {
              const self = p.id === me.id;
              const locked = self || (demoStaff && !Number(p.is_demo));
              return (
                <tr key={p.id} style={Number(p.active) ? undefined : { opacity: 0.6 }}>
                  <td>{p.name}{self && <span className="muted"> (you)</span>}{Number(p.is_demo) ? <><br /><span className="muted">demo</span></> : null}</td>
                  <td>{demoStaff ? maskEmail(p.email) : p.email ?? <span className="muted">none</span>}</td>
                  <td>{p.member_no}</td>
                  <td>{p.role === "staff" ? <span className="pill green">Staff</span> : "Member"}</td>
                  <td>{Number(p.active) ? "Active" : <span className="pill">Deactivated</span>}</td>
                  <td>
                    {!locked && (
                      <div className="actions">
                        <form action={roleAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="role" value={p.role === "staff" ? "member" : "staff"} />
                          <SubmitButton className="btn small sec" pending="…">{p.role === "staff" ? "Make member" : "Make staff"}</SubmitButton>
                        </form>
                        <form action={activeAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="active" value={Number(p.active) ? "0" : "1"} />
                          <SubmitButton className={`btn small ${Number(p.active) ? "danger" : "sec"}`} pending="…">{Number(p.active) ? "Deactivate" : "Reactivate"}</SubmitButton>
                        </form>
                        {!Number(p.is_demo) && <ResetPassword id={p.id} action={resetPasswordAction} />}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 10 }}>
        New staff: add their email to the STAFF_EMAILS setting before they sign up, or promote them here. There&apos;s no email reset yet, so &quot;Reset password&quot; gives a one-time password to pass on.
      </p>
    </section>
  );
}

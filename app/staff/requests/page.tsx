import Link from "next/link";
import { getCtx } from "@/lib/context";
import { requireStaff } from "@/lib/auth";
import { activityLabel } from "@/lib/config";
import SubmitButton from "@/components/SubmitButton";
import { REQUEST_STATUS, REQUEST_TYPES, isRequestStatus, requestCounts, requestQueue, requestTime, type RequestStatus } from "@/lib/requests";
import { requestStatusAction } from "../actions";

type Search = { status?: string; area?: string; msg?: string; error?: string };

export default async function StaffRequests({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  await requireStaff();
  const { db, cfg } = await getCtx();
  // Default view: everything that still needs doing. "all" shows the full log.
  const status: RequestStatus | "all" | "todo" = sp.status === "all" ? "all" : sp.status && isRequestStatus(sp.status) ? sp.status : "todo";
  const area = cfg.activities.some((a) => a.key === sp.area) ? sp.area : undefined;
  const [rows, counts] = await Promise.all([
    requestQueue(db, { status: status === "all" || status === "todo" ? undefined : status, activity: area }),
    requestCounts(db),
  ]);
  const visible = status === "todo" ? rows.filter((r) => r.status !== "done") : rows;
  const href = (p: { status?: string; area?: string }) => {
    const q = new URLSearchParams();
    const s = p.status ?? status;
    const a = "area" in p ? p.area : area;
    if (s !== "todo") q.set("status", s);
    if (a) q.set("area", a);
    const str = q.toString();
    return `/staff/requests${str ? `?${str}` : ""}`;
  };
  const statusChips: [string, string][] = [
    ["todo", `To do (${counts.byStatus.open + counts.byStatus.in_progress})`],
    ["open", `Open (${counts.byStatus.open})`],
    ["in_progress", `In progress (${counts.byStatus.in_progress})`],
    ["done", `Done (${counts.byStatus.done})`],
    ["all", "All"],
  ];
  const back = href({});

  return (
    <>
      {sp.msg && <p className="note ok" role="status" style={{ marginBottom: 12 }}>{sp.msg}</p>}
      {sp.error && <p className="note error" role="alert" style={{ marginBottom: 12 }}>{sp.error}</p>}
      <section className="panel">
        <h2>Member requests · {counts.byStatus.open} open</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          One-way, non-urgent requests from members (&ldquo;out of clays&rdquo;, &ldquo;unlock the shed&rdquo;). There are no replies: members see the status change. If you need to talk to them, find them or call. Every request is kept as a permanent log.
        </p>
        <nav className="chips" aria-label="Filter by status" style={{ marginBottom: 8 }}>
          {statusChips.map(([k, label]) => (
            <Link key={k} href={href({ status: k })} className={`chip ${status === k ? "on" : ""}`} aria-current={status === k ? "page" : undefined}>{label}</Link>
          ))}
        </nav>
        <nav className="chips" aria-label="Filter by area" style={{ marginBottom: 12 }}>
          <Link href={href({ area: undefined })} className={`chip ${!area ? "on" : ""}`} aria-current={!area ? "page" : undefined}>All areas</Link>
          {cfg.activities.filter((a) => a.active || counts.byArea[a.key]).map((a) => (
            <Link key={a.key} href={href({ area: a.key })} className={`chip ${area === a.key ? "on" : ""}`} aria-current={area === a.key ? "page" : undefined}>
              {a.label}{counts.byArea[a.key] ? ` (${counts.byArea[a.key]})` : ""}
            </Link>
          ))}
        </nav>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Sent</th><th>Member</th><th>Area · type</th><th>Note</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {visible.length === 0 && <tr><td colSpan={6} className="empty">{status === "todo" ? "Nothing to do. Nice." : "No requests match."}</td></tr>}
              {visible.map((r) => {
                const [label, tone] = REQUEST_STATUS[r.status];
                return (
                  <tr key={r.id}>
                    <td>RQ-{String(r.id).padStart(4, "0")}<br /><span className="muted">{requestTime(r.created_at, cfg.timezone)}</span></td>
                    <td>{r.member_name}<br /><span className="muted">#{r.member_no}</span></td>
                    <td><strong>{activityLabel(cfg, r.activity)}</strong><br /><span className="muted">{REQUEST_TYPES[r.type]}</span></td>
                    <td style={{ minWidth: 200 }}>{r.note}</td>
                    <td>
                      <span className={`pill ${tone}`}>{label}</span>
                      {r.started_by_name && r.started_at && <><br /><span className="muted">Started by {r.started_by_name}, {requestTime(r.started_at, cfg.timezone)}</span></>}
                      {r.done_by_name && r.done_at && <><br /><span className="muted">Done by {r.done_by_name}, {requestTime(r.done_at, cfg.timezone)}</span></>}
                    </td>
                    <td>
                      {r.status !== "done" && (
                        <form action={requestStatusAction} className="actions">
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="back" value={back} />
                          {r.status === "open" && <SubmitButton name="to" value="in_progress" className="btn small sec" pending="…">In progress</SubmitButton>}
                          <SubmitButton name="to" value="done" className="btn small" pending="…">Done</SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

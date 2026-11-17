export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="kpis">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="kpi skeleton" style={{ height: 62 }} />)}</div>
      <div className="panel skeleton" style={{ height: 280 }} />
    </div>
  );
}

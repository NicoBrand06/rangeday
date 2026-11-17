export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="bar"><h1 className="skeleton" style={{ width: "60%" }}>&nbsp;</h1><p className="skeleton" style={{ width: "40%" }}>&nbsp;</p></div>
      <div className="pad">
        <span className="sr-only">Loading…</span>
        {[0, 1, 2].map((i) => <div key={i} className="card skeleton" style={{ height: 64 }} />)}
      </div>
    </div>
  );
}

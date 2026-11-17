"use client";

export default function StaffError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="panel">
      <h2>Something went wrong</h2>
      <p className="note error" role="alert">This page couldn&apos;t load. Check the connection and try again. If it keeps happening, the server logs (Vercel → Logs) have the details.</p>
      <button className="btn small" onClick={reset} style={{ marginTop: 10 }}>Try again</button>
    </section>
  );
}

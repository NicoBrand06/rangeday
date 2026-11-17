"use client";
import Link from "next/link";

export default function MemberError({ reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <div className="bar"><h1>Something went wrong</h1><p>Sorry about that.</p></div>
      <div className="pad">
        <p className="note error" role="alert">We couldn&apos;t load this page. It might be a connection problem. Nothing you booked has been lost.</p>
        <button className="btn" onClick={reset}>Try again</button>
        <Link href="/" className="btn sec">Go to Home</Link>
      </div>
    </>
  );
}

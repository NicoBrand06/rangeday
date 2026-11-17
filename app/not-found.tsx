import Link from "next/link";

export default function NotFound() {
  return (
    <div className="app" style={{ paddingBottom: 0 }}>
      <div className="bar"><h1>Not found</h1><p>That page doesn&apos;t exist, or it isn&apos;t yours to see.</p></div>
      <div className="pad">
        <Link href="/" className="btn">Go to Home</Link>
      </div>
    </div>
  );
}

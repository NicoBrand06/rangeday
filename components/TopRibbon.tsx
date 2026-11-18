"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** The top ribbon of every member screen: the club name, and a way to send the pro shop a non-urgent request or problem report. */
export default function TopRibbon({ clubName }: { clubName: string }) {
  const on = usePathname().startsWith("/requests");
  return (
    <div className="topstrip">
      <span className="club">{clubName}</span>
      <Link href="/requests" className="tell-shop" aria-current={on ? "page" : undefined} title="Report a problem or ask the shop for help">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        <path d="M12 8v4M12 15.5v.01" />
      </svg>
      Tell the shop
      </Link>
    </div>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/staff", label: "Today" },
  { href: "/staff/lessons", label: "Lessons" },
  { href: "/staff/events", label: "Events" },
  { href: "/staff/reservations", label: "Reservations" },
  { href: "/staff/requests", label: "Requests" },
  { href: "/staff/people", label: "People" },
  { href: "/staff/settings", label: "Settings" },
];

export default function StaffNav({ signOut, name }: { signOut: () => Promise<void>; name: string }) {
  const path = usePathname();
  return (
    <nav aria-label="Staff">
      {LINKS.map((l) => {
        const on = l.href === "/staff" ? path === l.href : path.startsWith(l.href) || (l.href === "/staff/lessons" && path.startsWith("/staff/instructors"));
        return (
          <Link key={l.href} href={l.href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
      <form action={signOut} style={{ display: "inline" }}>
        <button title={`Signed in as ${name}`}>Sign out</button>
      </form>
    </nav>
  );
}

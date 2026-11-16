"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/staff", label: "Today" },
  { href: "/staff/events", label: "Events" },
  { href: "/staff/reservations", label: "Reservations" },
];

export default function StaffNav({ signOut, name }: { signOut: () => Promise<void>; name: string }) {
  const path = usePathname();
  return (
    <nav aria-label="Staff">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={(l.href === "/staff" ? path === l.href : path.startsWith(l.href)) ? "on" : ""}>
          {l.label}
        </Link>
      ))}
      <form action={signOut} style={{ display: "inline" }}>
        <button title={`Signed in as ${name}`}>Sign out</button>
      </form>
    </nav>
  );
}

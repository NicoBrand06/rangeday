import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { getCtx } from "@/lib/context";
import { textOn } from "@/lib/config";
import "./globals.css";

// Every page is rendered per request: it depends on who is signed in and on the
// club's settings, which staff can change at any time.

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const { cfg } = await getCtx();
  return {
    title: `RangeDay · ${cfg.clubName}`,
    description: "Book range sessions and lessons, RSVP to events and reserve pro shop items.",
  };
}

export async function generateViewport(): Promise<Viewport> {
  await connection();
  const { cfg } = await getCtx();
  return { width: "device-width", initialScale: 1, themeColor: cfg.primary };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const { cfg } = await getCtx();
  // The club's colours replace the default navy and green everywhere.
  const theme = `:root{--navy:${cfg.primary};--green:${cfg.accent};--on-navy:${textOn(cfg.primary)};--on-green:${textOn(cfg.accent)}}`;
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: theme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RangeDay · Cedar Ridge Sporting Club",
  description: "Book range sessions, RSVP to events and reserve pro shop items. A portfolio MVP with synthetic data.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1b2a41" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

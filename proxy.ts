import { NextResponse, type NextRequest } from "next/server";

// A quick first gate: visitors with no session cookie are sent to the login page.
// This only checks that a cookie exists. The real checks (is the session valid?
// is this user staff?) happen on the server in every page and action (lib/auth.ts).

const PUBLIC = ["/login", "/signup"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (req.cookies.get("rd_session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|icon|apple-icon|.*\\.(?:png|svg|jpg|ico|webp)$).*)"],
};

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/session";

export async function middleware(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = req.nextUrl.pathname.startsWith("/login");
  // Public: legal pages and school logos (school branding, not personal data).
  if (req.nextUrl.pathname.startsWith("/legal") || req.nextUrl.pathname.startsWith("/api/logo/")) return NextResponse.next();
  if (!session && !isLogin) return NextResponse.redirect(new URL("/login", req.url));
  if (session && isLogin) return NextResponse.redirect(new URL("/dashboard", req.url));
  return NextResponse.next();
}

// Static brand assets (logos) are public: the sign-in page shows them before anyone logs in.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/).*)"] };

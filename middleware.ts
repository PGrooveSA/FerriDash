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

// Static brand assets (logos, app icons, web app manifest) are public: the sign-in page and the
// browser use them before anyone logs in.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon-32.png|icon.svg|icon-192.png|icon-512.png|icon-maskable-512.png|apple-icon.png|manifest.webmanifest|brand/).*)"] };

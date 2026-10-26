import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/session";

const PLATFORM_PATHS = ["/dashboard", "/schools", "/profile", "/api/avatar", "/api/session-end"];

export async function middleware(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = req.nextUrl.pathname.startsWith("/login");
  // Public: legal pages and school logos (school branding, not personal data).
  if (req.nextUrl.pathname.startsWith("/legal") || req.nextUrl.pathname.startsWith("/api/logo/")) return NextResponse.next();
  if (!session && !isLogin) return NextResponse.redirect(new URL("/login", req.url));
  if (session && isLogin) return NextResponse.redirect(new URL("/dashboard", req.url));
  // The platform admin only manages schools: everything inside a school is off limits
  // (pages and server actions also check this themselves).
  if (session?.role === "super_admin" && !PLATFORM_PATHS.some((p) => req.nextUrl.pathname === p || req.nextUrl.pathname.startsWith(p + "/"))) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  return NextResponse.next();
}

// Static brand assets (logos, app icons, web app manifest) are public: the sign-in page and the
// browser use them before anyone logs in.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon-32.png|icon.svg|icon-192.png|icon-512.png|icon-maskable-512.png|apple-icon.png|manifest.webmanifest|brand/).*)"] };

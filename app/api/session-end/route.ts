import { NextResponse } from "next/server";
import { SCHOOL_COOKIE, SESSION_COOKIE } from "@/lib/session";

// A signed session whose user can no longer use FerriDash (account switched off, school suspended):
// clear the cookies and go to sign-in, instead of bouncing between /login and /dashboard.
export function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/login?ended=1", req.url));
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(SCHOOL_COOKIE);
  return res;
}

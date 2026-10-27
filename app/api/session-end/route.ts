import { NextResponse, type NextRequest } from "next/server";
import { SCHOOL_COOKIE, SESSION_COOKIE } from "@/lib/session";
import { DEVICE_COOKIE, parseDevice, unlinkDevice } from "@/lib/devices";

// A signed session whose user can no longer use FerriDash (account switched off, school suspended):
// clear the cookies and go to sign-in, instead of bouncing between /login and /dashboard.
export async function GET(req: NextRequest) {
  // The account can no longer be used here: its notifications stop coming to this phone.
  await unlinkDevice(parseDevice(req.cookies.get(DEVICE_COOKIE)?.value));
  const res = NextResponse.redirect(new URL("/login?ended=1", req.url));
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(SCHOOL_COOKIE);
  return res;
}

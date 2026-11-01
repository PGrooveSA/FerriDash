import { cookies } from "next/headers";
import { getCtx } from "@/lib/auth";
import { clientIp, overLimit } from "@/lib/rate-limit";
import { securityEvent } from "@/lib/security-log";
import { DEVICE_COOKIE, deviceCookieValue, linkDevice, parseDevice } from "@/lib/devices";

export const dynamic = "force-dynamic";

/**
 * The FerriDash app reports its push token here (components/DeviceLink.tsx). It is kept in a cookie for the
 * next sign-in, and linked straight away when someone is already signed in on this phone.
 */
export async function POST(req: Request) {
  // Only FerriDash's own pages report a phone (no other site, even though it carries no cookies cross-site).
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) {
    await securityEvent("bad_origin", { route: "device", origin: origin.slice(0, 100) });
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (await overLimit({ key: `device:${await clientIp()}`, max: 30, windowSec: 600, blockSec: 600 })) return Response.json({ error: "Too many requests" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { token?: string; platform?: string } | null;
  const device = parseDevice(`${body?.platform}:${body?.token}`);
  if (!device) return Response.json({ error: "Invalid device" }, { status: 400 });
  const store = await cookies();
  store.set(DEVICE_COOKIE, deviceCookieValue(device), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/", maxAge: 365 * 24 * 3600,
  });
  // Only a session that is still valid (not ended by a password change) gets this phone's notifications.
  const ctx = await getCtx();
  if (ctx) await linkDevice(ctx.user.id, device);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

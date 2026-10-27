import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { DEVICE_COOKIE, deviceCookieValue, linkDevice, parseDevice } from "@/lib/devices";

export const dynamic = "force-dynamic";

/**
 * The FerriDash app reports its push token here (components/DeviceLink.tsx). It is kept in a cookie for the
 * next sign-in, and linked straight away when someone is already signed in on this phone.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: string; platform?: string } | null;
  const device = parseDevice(`${body?.platform}:${body?.token}`);
  if (!device) return Response.json({ error: "Invalid device" }, { status: 400 });
  const store = await cookies();
  store.set(DEVICE_COOKIE, deviceCookieValue(device), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/", maxAge: 365 * 24 * 3600,
  });
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (session) await linkDevice(session.uid, device);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

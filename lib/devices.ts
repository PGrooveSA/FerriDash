// Links the phone running the FerriDash app to whoever signs in on it, so push notifications reach them.
// The app hands over its push token in the address (#device=...&platform=...); app/api/device keeps it in a
// cookie, and every sign-in on that phone moves the token to the new user. Signing out unlinks it, so a
// shared phone never receives the previous person's notifications.
import { run } from "./db";

export const DEVICE_COOKIE = "sh_device";

export type Device = { token: string; platform: "android" | "ios" };

/** "android:<token>" -> Device; anything malformed -> null. */
export function parseDevice(value: string | undefined | null): Device | null {
  const m = /^(android|ios):([A-Za-z0-9:_\-]{20,4096})$/.exec(value ?? "");
  return m ? { platform: m[1] as Device["platform"], token: m[2] } : null;
}

export const deviceCookieValue = (d: Device) => `${d.platform}:${d.token}`;

export async function linkDevice(userId: number, d: Device) {
  await run(`INSERT INTO push_devices (user_id, token, platform) VALUES (?,?,?)
    ON CONFLICT (token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, last_seen_at = ferri_now()`, userId, d.token, d.platform);
}

export async function unlinkDevice(d: Device | null) {
  if (d) await run("DELETE FROM push_devices WHERE token = ?", d.token);
}

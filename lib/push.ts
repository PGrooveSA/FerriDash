// Push notifications to the FerriDash mobile apps: Android through Firebase Cloud Messaging (HTTP v1 API),
// iPhone straight through Apple's push service (APNs). Phones are linked to users in push_devices when
// someone signs in inside the app (app/api/device). Sending happens after the response (next/server
// after()), so a slow or unreachable push service never slows down or fails the action that triggered it.
//
// Environment (Vercel → Settings → Environment Variables); a platform without its keys is skipped:
//   FIREBASE_SERVICE_ACCOUNT  the Firebase service account key file (JSON), pasted whole
//   APNS_KEY                  Apple push key (.p8 file contents), APNS_KEY_ID, APNS_TEAM_ID
//   APNS_BUNDLE_ID            default com.infiniteqgraphics.ferridash; APNS_SANDBOX=1 for Xcode debug builds
import { after } from "next/server";
import { connect } from "node:http2";
import { SignJWT, importPKCS8 } from "jose";
import { all, run } from "./db";

export type PushMessage = { title: string; body: string; /** FerriDash page opened when the notification is tapped */ url: string };

/** Sends to every phone of these users once the current request has finished. Never throws. */
export function notify(userIds: (number | null | undefined)[], msg: PushMessage) {
  const ids = [...new Set(userIds.filter((x): x is number => typeof x === "number" && x > 0))];
  if (!ids.length || (!firebaseConfig() && !apnsConfig())) return;
  after(() => send(ids, msg).catch((e) => console.error("[push]", (e as Error).message)));
}

async function send(userIds: number[], msg: PushMessage) {
  const devices = await all<{ id: number; token: string; platform: "android" | "ios" }>(
    `SELECT id, token, platform FROM push_devices WHERE user_id IN (${userIds.map(() => "?").join(",")})`, ...userIds);
  const gone: number[] = [];
  const android = devices.filter((d) => d.platform === "android"), ios = devices.filter((d) => d.platform === "ios");
  if (android.length && firebaseConfig()) await Promise.all(android.map(async (d) => { if ((await sendAndroid(d.token, msg)) === "gone") gone.push(d.id); }));
  if (ios.length && apnsConfig()) gone.push(...(await sendIos(ios, msg)));
  // Uninstalled apps and expired tokens: stop sending to them.
  if (gone.length) await run(`DELETE FROM push_devices WHERE id IN (${gone.map(() => "?").join(",")})`, ...gone);
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// ---------------- Android: Firebase Cloud Messaging ----------------
type ServiceAccount = { project_id: string; client_email: string; private_key: string };
function firebaseConfig(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    return sa.project_id && sa.client_email && sa.private_key ? { ...sa, private_key: sa.private_key.replace(/\\n/g, "\n") } : null;
  } catch { return null; }
}

let fcmToken: { value: string; expires: number } | null = null;
async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  if (fcmToken && fcmToken.expires > Date.now() + 60_000) return fcmToken.value;
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email).setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now).setExpirationTime(now + 3600)
    .sign(await importPKCS8(sa.private_key, "RS256"));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!j.access_token) throw new Error(`Firebase sign-in failed: ${j.error_description ?? res.status}`);
  fcmToken = { value: j.access_token, expires: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return fcmToken.value;
}

async function sendAndroid(token: string, msg: PushMessage): Promise<"ok" | "gone" | "failed"> {
  const sa = firebaseConfig()!;
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${await fcmAccessToken(sa)}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: clip(msg.title, 120), body: clip(msg.body, 300) },
        data: { url: msg.url },
        android: { priority: "high", notification: { sound: "default" } },
      },
    }),
  });
  if (res.ok) return "ok";
  const text = await res.text();
  if (res.status === 404 || /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT.*token/i.test(text)) return "gone";
  console.error("[push] Firebase", res.status, text.slice(0, 300));
  return "failed";
}

// ---------------- iPhone: Apple Push Notification service ----------------
type Apns = { key: string; keyId: string; teamId: string; bundleId: string; host: string };
function apnsConfig(): Apns | null {
  const { APNS_KEY: key, APNS_KEY_ID: keyId, APNS_TEAM_ID: teamId } = process.env;
  if (!key || !keyId || !teamId) return null;
  return {
    key: key.replace(/\\n/g, "\n"), keyId, teamId,
    bundleId: process.env.APNS_BUNDLE_ID || "com.infiniteqgraphics.ferridash",
    host: process.env.APNS_SANDBOX === "1" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com",
  };
}

let apnsJwt: { value: string; expires: number } | null = null;
async function apnsToken(c: Apns): Promise<string> {
  // Apple accepts a token for an hour and rejects ones refreshed too often: reuse it for 50 minutes.
  if (apnsJwt && apnsJwt.expires > Date.now()) return apnsJwt.value;
  const value = await new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: c.keyId })
    .setIssuer(c.teamId).setIssuedAt().sign(await importPKCS8(c.key, "ES256"));
  apnsJwt = { value, expires: Date.now() + 50 * 60_000 };
  return value;
}

/** Sends to each iPhone over one HTTP/2 connection; returns the ids of devices Apple says are gone. */
async function sendIos(devices: { id: number; token: string }[], msg: PushMessage): Promise<number[]> {
  const c = apnsConfig()!;
  const auth = `bearer ${await apnsToken(c)}`;
  const payload = JSON.stringify({ aps: { alert: { title: clip(msg.title, 120), body: clip(msg.body, 300) }, sound: "default" }, url: msg.url });
  const session = connect(c.host);
  session.on("error", (e) => console.error("[push] Apple connection", e.message));
  try {
    const results = await Promise.all(devices.map((d) => new Promise<number | null>((resolve) => {
      const req = session.request({
        ":method": "POST", ":path": `/3/device/${d.token}`,
        authorization: auth, "apns-topic": c.bundleId, "apns-push-type": "alert", "apns-priority": "10",
        "content-type": "application/json",
      });
      let status = 0, body = "";
      req.on("response", (h) => { status = Number(h[":status"]); });
      req.setEncoding("utf8");
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        if (status === 200) return resolve(null);
        if (status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(body)) return resolve(d.id);
        console.error("[push] Apple", status, body.slice(0, 200));
        resolve(null);
      });
      req.on("error", () => resolve(null));
      req.end(payload);
    })));
    return results.filter((x): x is number => x != null);
  } finally {
    session.close();
  }
}

// ---------------- Who gets what ----------------

/** Active users of a school who can read a notice for this audience (see lib/notices.ts). */
export async function noticeAudienceUsers(schoolId: number, audience: string, exceptUserId: number): Promise<number[]> {
  const roles = audience === "staff" ? ["school_admin", "teacher"] : audience === "learners" ? ["learner"]
    : audience === "parents" ? ["parent"] : ["school_admin", "teacher", "learner", "parent"];
  return (await all<{ id: number }>(`SELECT id FROM users WHERE school_id = ? AND active = 1 AND id <> ? AND role IN (${roles.map(() => "?").join(",")})`,
    schoolId, exceptUserId, ...roles)).map((r) => r.id);
}

/** The learners' own logins plus their parents' logins. */
export async function familyOf(learnerIds: number[]): Promise<number[]> {
  if (!learnerIds.length) return [];
  const q = learnerIds.map(() => "?").join(",");
  return (await all<{ id: number }>(`
    SELECT user_id id FROM learners WHERE id IN (${q}) AND user_id IS NOT NULL
    UNION SELECT g.parent_user_id FROM guardian_links g JOIN users u ON u.id = g.parent_user_id WHERE g.learner_id IN (${q}) AND u.active = 1`,
    ...learnerIds, ...learnerIds)).map((r) => r.id);
}

/** Parents' logins only (fees and absences are the parents' business). */
export async function parentsOf(learnerId: number): Promise<number[]> {
  return (await all<{ id: number }>("SELECT g.parent_user_id id FROM guardian_links g JOIN users u ON u.id = g.parent_user_id WHERE g.learner_id = ? AND u.active = 1", learnerId)).map((r) => r.id);
}

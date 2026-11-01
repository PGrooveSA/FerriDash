import { dailyFeesJob } from "@/lib/fees";
import { securityEvent } from "@/lib/security-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs once a day (vercel.json → crons, 06:00 UTC = 08:00 in South Africa): automatic overdue-fee reminders, and
 * online payments still waiting for an answer brought up to date. Vercel calls it with "Authorization: Bearer
 * <CRON_SECRET>"; without CRON_SECRET set in Vercel the job refuses to run.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    await securityEvent("forbidden_route", { route: "cron/daily" });
    return new Response("Unauthorized", { status: 401 });
  }
  const r = await dailyFeesJob();
  console.log(`[cron] fee reminders sent: ${r.reminded}, online payments checked: ${r.checked}`);
  return Response.json(r);
}

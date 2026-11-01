import { handlePayfastItn } from "@/lib/fees";
import { itnPairs } from "@/lib/payfast";
import { clientIp, overLimit } from "@/lib/rate-limit";
import { securityEvent } from "@/lib/security-log";

export const dynamic = "force-dynamic";

/**
 * PayFast's ITN (Instant Transaction Notification): how a PayFast payment turned out. Public (PayFast has no
 * session), so nothing here is trusted until lib/fees.ts handlePayfastItn has checked the signature, merchant and
 * amount and PayFast has confirmed it. PayFast only needs a 200 reply; it retries otherwise.
 */
export async function POST(req: Request) {
  if (await overLimit({ key: `payfast-itn:${await clientIp()}`, max: 120, windowSec: 600, blockSec: 600 })) return new Response("Too many requests", { status: 429 });
  const body = (await req.text()).slice(0, 20000);
  try {
    const note = await handlePayfastItn(itnPairs(body));
    if (note.startsWith("rejected")) await securityEvent("payment_rejected", { provider: "PayFast", note: note.slice(0, 120) });
    else console.log(`[payfast] ${note}`);
  } catch (e) {
    console.error("[payfast]", (e as Error).message);
    return new Response("Error", { status: 500 }); // PayFast tries again later
  }
  return new Response("OK");
}

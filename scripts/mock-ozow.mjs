// Local stand-in for Ozow's One API, for testing online payments without a merchant account.
// Follows the documented endpoints: POST /v1/token, POST /v1/payments, GET /v1/payments/{id}/transactions,
// plus a fake payment page where you choose "Pay" or "Cancel".
// Usage: node scripts/mock-ozow.mjs [port]   then start FerriDash with OZOW_BASE_URL=http://127.0.0.1:<port>
// Credentials it accepts: client ID "test-client", client secret "test-secret".
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.argv[2] || 4010);
const base = `http://127.0.0.1:${port}`;
const tokens = new Set();
const payments = new Map(); // id -> { body, transactions: [] }

const json = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
const err = (res, code, c, detail) => json(res, code, { id: randomUUID(), code: c, title: c, detail });
const read = (req) => new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
const authed = (req) => tokens.has((req.headers.authorization || "").replace(/^Bearer /, ""));

createServer(async (req, res) => {
  const url = new URL(req.url, base);
  const p = url.pathname;
  console.log(req.method, p + url.search);

  if (req.method === "POST" && p === "/v1/token") {
    const f = new URLSearchParams(await read(req));
    if (f.get("grant_type") !== "client_credentials" || f.get("client_id") !== "test-client" || f.get("client_secret") !== "test-secret") return err(res, 401, "Unauthorized", "Invalid client credentials");
    const t = randomUUID(); tokens.add(t);
    return json(res, 200, { access_token: t, token_type: "Bearer", expires_in: 14400, scope: f.get("scope") });
  }

  if (req.method === "POST" && p === "/v1/payments") {
    if (!authed(req)) return err(res, 401, "Unauthorized", "Missing or invalid token");
    const b = JSON.parse((await read(req)) || "{}");
    const bad = [];
    if (!b.siteCode) bad.push("siteCode is required");
    if (b.amount?.currency !== "ZAR" || !(b.amount?.value >= 0.01)) bad.push("amount is invalid");
    if (!b.merchantReference || b.merchantReference.length > 50) bad.push("merchantReference is invalid");
    if (!b.expireAt || Number.isNaN(Date.parse(b.expireAt))) bad.push("expireAt is invalid");
    if (b.beneficiaryReference && !/^[A-Za-z0-9]{1,20}$/.test(b.beneficiaryReference)) bad.push("beneficiaryReference is invalid");
    if (bad.length) return err(res, 400, "BadRequest", bad.join("; "));
    for (const k of ["returnUrl", "notifyUrl"]) if (b[k] && /\/\/(localhost|127\.|10\.|192\.168\.)/.test(b[k])) return err(res, 403, "Forbidden", `${k} must be reachable from the internet`);
    const id = randomUUID();
    payments.set(id, { body: b, transactions: [] });
    return json(res, 201, { id, status: "Created", redirectUrl: `${base}/pay/${id}`, links: { self: `${base}/v1/payments/${id}` } });
  }

  const m = p.match(/^\/v1\/payments\/([^/]+)\/transactions$/);
  if (req.method === "GET" && m) {
    if (!authed(req)) return err(res, 401, "Unauthorized", "Missing or invalid token");
    if (!url.searchParams.get("fromDate") || !url.searchParams.get("toDate")) return err(res, 400, "BadRequest", "fromDate and toDate are required");
    const pay = payments.get(m[1]);
    const results = pay ? pay.transactions : [];
    return json(res, 200, { results, meta: { totalPages: 1, totalItems: results.length }, links: { self: url.href, first: url.href } });
  }

  const pg = p.match(/^\/pay\/([^/]+)$/);
  if (pg && payments.has(pg[1])) {
    const pay = payments.get(pg[1]);
    if (req.method === "POST") {
      const outcome = url.searchParams.get("outcome");
      const now = new Date().toISOString();
      pay.transactions.push({
        id: randomUUID(), amount: pay.body.amount, merchantReference: pay.body.merchantReference, siteCode: pay.body.siteCode, institution: "Test Bank",
        status: outcome === "pay" ? "Successful" : outcome === "pending" ? "Pending" : "Incomplete",
        reason: outcome === "pay" ? null : outcome === "pending" ? "Awaiting bank" : "The payer cancelled at their bank",
        createdDate: now, completedDate: outcome === "pending" ? null : now,
      });
      const back = pay.body.returnUrl;
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(`<!doctype html><title>Ozow (test)</title><h1 id="done">${outcome === "pay" ? "Payment successful" : "Payment not completed"}</h1>${back ? `<a href="${back}">Return to merchant</a>` : "<p>You can close this page and return to the school.</p>"}`);
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(`<!doctype html><title>Ozow (test)</title><h1>Ozow test payment</h1><p id="amount">R ${pay.body.amount.value.toFixed(2)} · ${pay.body.merchantReference}</p>
      <form method="post" action="/pay/${pg[1]}?outcome=pay"><button id="pay">Pay</button></form>
      <form method="post" action="/pay/${pg[1]}?outcome=pending"><button id="pending">Leave pending</button></form>
      <form method="post" action="/pay/${pg[1]}?outcome=cancel"><button id="cancel">Cancel</button></form>`);
  }
  err(res, 404, "NotFound", p);
}).listen(port, "127.0.0.1", () => console.log(`Mock Ozow on ${base} (client test-client / test-secret)`));

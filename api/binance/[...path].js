/**
 * Binance proxy as a Vercel Serverless Function (Hobby plan, free, no card).
 *
 * Lovable's server is in a region Binance blocks (HTTP 451), so the money
 * app calls this function instead. The function runs in Mumbai (bom1 —
 * set in vercel.json / project settings), which Binance accepts.
 *
 * Security:
 * - Only allow-listed Binance paths are forwarded.
 * - Every call needs the X-Proxy-Token header matching PROXY_TOKEN
 *   (set as a Vercel env var — never in this repo).
 * - The Binance API secret never passes through here; only the read-only
 *   API key header and the HMAC signature (already in the query string).
 * - The key is read-only, so even a leak cannot trade or withdraw.
 *
 * Vercel quirk (fixed 2026-11-17): the rewrite to this catch-all route
 * appends the matched path as a `path=...` query item to the invocation
 * URL. Forwarding it to Binance adds an extra unsigned item, which breaks
 * Binance's HMAC signature check on signed calls — so it is stripped
 * below, and everything else is forwarded byte-for-byte, in order.
 */
const UPSTREAM = "https://api.binance.com";

const ALLOWED = new Set([
  "GET /sapi/v1/account/apiRestrictions",
  "GET /api/v3/account",
  "POST /sapi/v1/asset/get-funding-asset",
  "GET /api/v3/myTrades",
  "GET /sapi/v1/capital/deposit/hisrec",
  "GET /api/v3/ticker/price",
]);

function cleanQuery(raw) {
  if (!raw) return "";
  return raw
    .split("&")
    .filter((p) => p && !p.startsWith("path="))
    .join("&");
}

module.exports = async (req, res) => {
  const token = process.env.PROXY_TOKEN || "";
  if (!token || req.headers["x-proxy-token"] !== token) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname.replace(/^\/api\/binance/, "") || "/";
  const key = `${req.method} ${path}`;
  if (!ALLOWED.has(key)) {
    return res.status(404).json({ error: "not allowed" });
  }
  const q = cleanQuery(url.search ? url.search.slice(1) : "");
  const upstream = UPSTREAM + path + (q ? `?${q}` : "");
  const headers = {};
  if (req.headers["x-mbx-apikey"]) {
    headers["X-MBX-APIKEY"] = req.headers["x-mbx-apikey"];
  }
  let body;
  if (req.method === "POST") {
    body = req.body
      ? typeof req.body === "string"
        ? req.body
        : new URLSearchParams(req.body).toString()
      : "";
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  try {
    const r = await fetch(upstream, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(20000),
    });
    const text = await r.text();
    res
      .status(r.status)
      .setHeader(
        "Content-Type",
        r.headers.get("content-type") || "application/json",
      )
      .send(text);
  } catch (e) {
    res.status(502).json({ error: "upstream failed" });
  }
};

const UPSTREAM = "https://api.binance.com";
const ALLOWED = new Set([
  "GET /sapi/v1/account/apiRestrictions",
  "GET /api/v3/account",
  "POST /sapi/v1/asset/get-funding-asset",
  "GET /api/v3/myTrades",
  "GET /sapi/v1/capital/deposit/hisrec",
]);
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
  const upstream = UPSTREAM + path + url.search;
  const headers = {};
  if (req.headers["x-mbx-apikey"]) {
    headers["X-MBX-APIKEY"] = req.headers["x-mbx-apikey"];
  }
  let body;
  if (req.method === "POST") {
    body = req.body ? (typeof req.body === "string" ? req.body : new URLSearchParams(req.body).toString()) : "";
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  try {
    const r = await fetch(upstream, { method: req.method, headers, body, signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    res.status(r.status).setHeader("Content-Type", r.headers.get("content-type") || "application/json").send(text);
  } catch (e) {
    res.status(502).json({ error: "upstream failed" });
  }
};

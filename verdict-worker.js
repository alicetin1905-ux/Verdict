// verdict-worker.js — CORS proxy for OKX public v5 endpoints.
// Deploy on Cloudflare Workers, then paste the worker URL into VERDICT's proxy field.
// Public market data only: it refuses anything outside the allowlist and never sees a key.

const HOSTS = [
  'https://www.okx.com',
  'https://eea.okx.com',
  'https://my.okx.com',
  'https://app.okx.com',
];

const ALLOWED = [
  '/api/v5/public/instruments',
  '/api/v5/public/mark-price',
  '/api/v5/public/funding-rate',
  '/api/v5/market/ticker',
  '/api/v5/market/candles',
  '/api/v5/market/history-candles',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    if (!ALLOWED.includes(url.pathname)) {
      return json({ code: 'proxy', msg: 'path not allowed: ' + url.pathname }, 403);
    }

    const attempts = [];
    for (const hostBase of HOSTS) {
      const target = hostBase + url.pathname + url.search;
      try {
        const upstream = await fetch(target, {
          headers: { 'Accept': 'application/json', 'User-Agent': 'verdict-proxy' },
          cf: { cacheTtl: 5, cacheEverything: true },
        });
        const body = await upstream.text();
        if (upstream.ok && body.includes('"code":"0"')) {
          return new Response(body, {
            headers: { ...CORS, 'Content-Type': 'application/json', 'X-Verdict-Host': hostBase },
          });
        }
        attempts.push(hostBase + ' → HTTP ' + upstream.status);
      } catch (err) {
        attempts.push(hostBase + ' → ' + err.message);
      }
    }
    return json({ code: 'proxy', msg: 'every OKX host failed', attempts }, 502);
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

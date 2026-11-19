// stub/inner.js — the internal socket's stand-in (never shipped): GET /program/presence answers A4-C12's shape from the
// suite's state/stub_presence.json ({"players":n}; missing = 0). Every other path is the table server's own (/health).
// After argo-a4-program-serve merges, the suite runs against its real count instead (run.mjs --serve real).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/program/presence') {
      let players = 0;
      try {
        const r = await env.STATE.fetch(new Request(new URL('/stub_presence.json', url.origin)));
        if (r.ok) players = Number((await r.json()).players) || 0;
      } catch (e) { players = 0; }
      return Response.json({ v: 1, players }, { headers: { 'cache-control': 'no-store' } });
    }
    return env.TABLE_SERVER.fetch(request);
  },
};

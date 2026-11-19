// stub/router.js — the suite's stand-in for §4.1's router (never shipped): A4-C11's /program/lan.json from the state
// directory (missing or unparseable → {"v":1,"origin":""}; always no-store), then the measured harness router for
// everything else (exactly /t to the table, the site with G5's MIME map and fallback).
import harness from './harness_router.js';

const EMPTY = '{"v":1,"origin":""}';
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/program/lan.json') {
      let body = EMPTY;
      try {
        const r = await env.STATE.fetch(new Request(new URL('/lan.json', url.origin)));
        if (r.ok) { const text = await r.text(); JSON.parse(text); body = text; }
      } catch (e) { body = EMPTY; }
      return new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    return harness.fetch(request, env);
  },
};

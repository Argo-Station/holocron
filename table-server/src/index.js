/**
 * index.js — the table server's Worker entry (ENCOUNTERS E6; ruling `encounters-e6-plumbing` ADDENDUM 2, P8.1–P8.3).
 *
 * THE UPGRADE URL ROUTES; THE FIRST FRAME ASKS. A Worker hands an upgrade to ONE Durable Object at upgrade time, so
 * `/t` carries exactly one of:
 *   ?open=1        → a new Table (newUniqueId), after the group's 20-opens-an-hour count   — first frame `open`
 *   ?code=<code>   → the table the Code object points at, after the group's slow_down check — first frame `join {code}`
 *   ?table=<id>    → that Table, after the slow_down check                                  — `join {tableId}` or `rejoin`
 *   ?list=1        → the group's Listing object                                             — `list`, then it closes
 * The Table checks that the first frame agrees with the route (P8.1.2). EVERY OUTCOME IS A FRAME (P8.1.3): a refusal here
 * accepts the socket on the Worker's own pair just long enough to send `{v:1, t:'error', code}` and close.
 * A code is NORMALISED before it names an object (P8.2.1). A `?table=` id that does not parse is `no_table`, counted.
 * NOTHING HERE LOGS (R-E6P-R4): no console call prints a URL, code or id.
 *
 * THIS WORKER IS THE THIRD DEPLOYABLE. A `commercial` push does not ship it; its deploy is Jason's word.
 */
import * as R from './rules.mjs';
import { Table } from './table.js';
import { Listing } from './listing.js';
import { Code } from './code.js';

export { Table, Listing, Code };

const json = (body, status) => Response.json(body, { status: status || 200, headers: { 'cache-control': 'no-store' } });

// A refusal as a frame on a socket the Worker accepts and closes at once (it is never held, so nothing hibernates here).
function refuse(code) {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  try { server.send(JSON.stringify({ v: R.V, t: 'error', code })); server.close(1000, code); } catch (e) {}
  return new Response(null, { status: 101, webSocket: client });
}
function forward(stub, request, headers) {
  const h = new Headers(request.headers);
  Object.keys(headers).forEach((k) => { if (headers[k] != null) h.set(k, headers[k]); });
  return stub.fetch(new Request(request.url, { headers: h, method: 'GET' }));
}
async function ask(stub, path) {
  const r = await stub.fetch('https://listing' + path, { method: 'POST', body: '{}' });
  return r.json().catch(() => ({ ok: false }));
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === '/health') return json({ ok: true, service: R.SERVICE, schema: R.SCHEMA });
      if (url.pathname !== '/t') return json({ ok: false, error: 'not_found' }, 404);
      if (request.headers.get('Upgrade') !== 'websocket') return json({ ok: false, error: 'expected_websocket' }, 426);

      const keys = Array.from(url.searchParams.keys());
      if (keys.length !== 1 || ['open', 'code', 'table', 'list'].indexOf(keys[0]) === -1) return refuse('bad_frame');   // P8.1.1
      const route = keys[0], value = url.searchParams.get(route) || '';
      const group = R.groupKey(request.headers.get('CF-Connecting-IP') || '') || 'unknown';
      const listing = env.LISTING.get(env.LISTING.idFromName(group));

      if (route === 'list') return value === '1' ? forward(listing, request, {}) : refuse('bad_frame');
      if (route === 'open') {
        if (value !== '1') return refuse('bad_frame');
        if (!(await ask(listing, '/may-open')).ok) return refuse('slow_down');                     // before newUniqueId (P8.3)
        return forward(env.TABLE.get(env.TABLE.newUniqueId()), request, { 'x-table-mode': 'open', 'x-table-group': group });
      }
      // ?code= and ?table=: slow_down FIRST, then the lookup; a miss is counted before its no_table goes out (P8.3)
      if (!(await ask(listing, '/may-join')).ok) return refuse('slow_down');
      if (route === 'code') {
        const code = R.normalizeCode(value);
        if (!code) { await ask(listing, '/failed'); return refuse('no_table'); }
        const ptr = await (await env.CODE.get(env.CODE.idFromName(code)).fetch('https://code/get')).json().catch(() => ({ ok: false }));
        if (!ptr.ok) { await ask(listing, '/failed'); return refuse(ptr.error === 'expired' ? 'expired' : 'no_table'); }
        let id;
        try { id = env.TABLE.idFromString(ptr.tableId); } catch (e) { await ask(listing, '/failed'); return refuse('no_table'); }
        return forward(env.TABLE.get(id), request, { 'x-table-mode': 'code', 'x-table-code': code, 'x-table-group': group });
      }
      let id;
      try { id = env.TABLE.idFromString(value); } catch (e) { await ask(listing, '/failed'); return refuse('no_table'); }   // P8.1.4
      return forward(env.TABLE.get(id), request, { 'x-table-mode': 'table', 'x-table-id': value, 'x-table-group': group });
    } catch (e) {
      return json({ ok: false, error: 'table_server_fault' }, 500);
    }
  },
};

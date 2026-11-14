/**
 * code.js — the Code Durable Object: ONE per live table code, named `idFromName(code)` (brief
 * `encounters-e6-plumbing-census` ADDENDUM 1, P8.2). It points a code at its table and holds nothing else:
 * `{ tableId, codeExpiresAt }` in storage, deleted by its alarm at expiry and at once by the table's `close` / `newcode`.
 * Reached only by the Worker (resolve) and by its Table (put, drop) — never by a client.
 */
import { DurableObject } from 'cloudflare:workers';

const KEY = 'ptr';
const json = (b, s) => Response.json(b, { status: s || 200 });

export class Code extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url), now = Date.now();
    const ptr = (await this.ctx.storage.get(KEY)) || null;
    const live = ptr && ptr.codeExpiresAt > now ? ptr : null;
    if (url.pathname === '/get') {
      if (live) return json({ ok: true, tableId: live.tableId, codeExpiresAt: live.codeExpiresAt });
      return json({ ok: false, error: ptr ? 'expired' : 'no_table' }, 404);
    }
    if (request.method !== 'POST') return json({ ok: false }, 405);
    const body = await request.json().catch(() => ({}));
    if (url.pathname === '/put') {
      if (live && live.tableId !== body.tableId) return json({ ok: false, error: 'taken' }, 409);   // a collision: the table draws again
      await this.ctx.storage.put(KEY, { tableId: String(body.tableId), codeExpiresAt: Number(body.codeExpiresAt) });
      await this.ctx.storage.setAlarm(Number(body.codeExpiresAt));
      return json({ ok: true });
    }
    if (url.pathname === '/drop') {
      if (ptr && ptr.tableId === body.tableId) { await this.ctx.storage.deleteAlarm(); await this.ctx.storage.deleteAll(); }
      return json({ ok: true });
    }
    return json({ ok: false }, 404);
  }
  async alarm() { await this.ctx.storage.deleteAll(); }
}

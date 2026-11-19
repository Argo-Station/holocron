/**
 * presence.js — the Presence Durable Object: S4's count for the Holocron PROGRAM only (ruling `argo-a4-launcher-build`
 * §3 A4-C12). The program's config (program/serve/holocron.capnp) binds a PRESENCE namespace; table-server/wrangler.jsonc
 * binds none, so online this class is exported and never instantiated, and `/program/presence` stays `not_found`.
 *
 * MECHANISM (disclosed at gate argo-a4-program-serve): ONE object, idFromName('program'), holds in STORAGE the ids of the
 * tables that have accepted a socket (a Table registers itself at each upgrade). `count()` asks each of them, over RPC,
 * for its live non-GM sockets (`Table.presenceCount`, read from `ctx.getWebSockets()` and each socket's attachment, which
 * is exactly what survives a table's hibernation), sums them, and forgets a table with no live socket left. Nothing is
 * kept in memory, so the count is the same after either object sleeps and wakes. It holds ids only: no code, label or key.
 */
import { DurableObject } from 'cloudflare:workers';

export class Presence extends DurableObject {
  async register(tableId) {
    const ids = (await this.ctx.storage.get('tables')) || [];
    if (ids.indexOf(tableId) === -1) { ids.push(tableId); await this.ctx.storage.put('tables', ids); }
  }

  async count() {
    const ids = (await this.ctx.storage.get('tables')) || [], keep = [];
    let players = 0;
    for (const id of ids) {
      let c = { live: 0, players: 0 };
      try { c = await this.env.TABLE.get(this.env.TABLE.idFromString(id)).presenceCount(); } catch (e) { /* gone */ }
      if (c.live > 0) { keep.push(id); players += c.players; }
    }
    if (keep.length !== ids.length) await this.ctx.storage.put('tables', keep);
    return players;
  }
}

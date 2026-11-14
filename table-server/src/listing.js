/**
 * listing.js — the Listing Durable Object: ONE per listing group (`encounters-e6-wire-online` §7; the group is
 * `encounters-e5-wire` §5's: IPv4 → the exact address, IPv6 → the /64; rules.mjs `groupKey`). It holds:
 *   - the group's LISTED tables `{ tableId → { label, openedAt, expiresAt } }`, each gone when its code expires or its
 *     table ends;
 *   - the group's source counters (ruling `encounters-e6-plumbing` ADDENDUM 2, P8.3): failed joins (10 per 10 min) and
 *     tables opened (20 per hour) — the times of each, never an address; the object's own name is the group key.
 * In STORAGE, not memory (E-E6P-1; R-E6W-3): an object's memory is reset after ~10 s idle, so a count held there would
 * protect nothing. Every entry goes when it expires and every count when its window ends; the alarm sits at the earliest end.
 * A player's `/t?list=1` socket is accepted HERE: `list` answers `tables`, then the socket closes.
 */
import { DurableObject } from 'cloudflare:workers';
import * as R from './rules.mjs';

const json = (b, s) => Response.json(b, { status: s || 200 });
const send = (ws, f) => { try { ws.send(JSON.stringify(Object.assign({ v: R.V }, f))); } catch (e) {} };

export class Listing extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url), now = Date.now();
    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const st = await this.#state(now);
    if (url.pathname === '/put') st.tables[String(body.tableId)] = { label: String(body.label || ''), openedAt: Number(body.openedAt), expiresAt: Number(body.expiresAt) };
    else if (url.pathname === '/drop') delete st.tables[String(body.tableId)];
    else if (url.pathname === '/may-open') {
      const w = R.windowAllows(st.opens, now, R.OPENS_WINDOW_MS, R.OPENS);
      st.opens = w.stamps;
      if (w.ok) st.opens.push(now);
      await this.#save(st, now);
      return json({ ok: w.ok });
    } else if (url.pathname === '/may-join') {
      const w = R.windowAllows(st.fails, now, R.FAILED_WINDOW_MS, R.FAILED_JOINS);
      st.fails = w.stamps;
      await this.#save(st, now);
      return json({ ok: w.ok });
    } else if (url.pathname === '/failed') st.fails.push(now);
    else return json({ ok: false }, 404);
    await this.#save(st, now);
    return json({ ok: true });
  }

  async webSocketMessage(ws, raw) {
    const read = R.readFrame(raw);
    if (!read.ok || read.frame.t !== 'list') send(ws, { t: 'error', code: 'bad_frame' });
    else {
      const st = await this.#state(Date.now());
      const tables = Object.keys(st.tables).map((tableId) => ({ tableId, label: st.tables[tableId].label, openedAt: st.tables[tableId].openedAt }))
        .sort((a, b) => b.openedAt - a.openedAt).slice(0, R.LIST_MAX);
      send(ws, { t: 'tables', tables });
    }
    try { ws.close(1000, 'listed'); } catch (e) {}
  }
  async webSocketClose(ws) { try { ws.close(1000, 'closing'); } catch (e) {} }

  // a window that ended is deleted; one still running re-arms the alarm at its end
  async alarm() { const now = Date.now(); const st = await this.#state(now); st.fails = R.windowAllows(st.fails, now, R.FAILED_WINDOW_MS, Infinity).stamps;
    st.opens = R.windowAllows(st.opens, now, R.OPENS_WINDOW_MS, Infinity).stamps; await this.#save(st, now); }

  async #state(now) {
    const st = (await this.ctx.storage.get('s')) || { tables: {}, fails: [], opens: [] };
    Object.keys(st.tables).forEach((k) => { if (!(st.tables[k].expiresAt > now)) delete st.tables[k]; });
    return st;
  }
  async #save(st, now) {
    if (!Object.keys(st.tables).length && !st.fails.length && !st.opens.length) {
      await this.ctx.storage.deleteAlarm(); await this.ctx.storage.deleteAll(); return;
    }
    await this.ctx.storage.put('s', st);
    // the alarm fires at the EARLIEST end, prunes what ended and re-arms (ADDENDUM 2, P8.3: each window goes when it ends)
    const ends = Object.keys(st.tables).map((k) => st.tables[k].expiresAt)
      .concat(st.fails.map((t) => t + R.FAILED_WINDOW_MS), st.opens.map((t) => t + R.OPENS_WINDOW_MS));
    await this.ctx.storage.setAlarm(Math.min.apply(null, ends));
  }
}

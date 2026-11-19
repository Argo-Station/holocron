#!/usr/bin/env node
/**
 * sync_seam.cjs — the client seam: pull, debounced push, and the moment the other device won.
 * Ruling `accounts-sync-architecture` §3.3 · `f34-phase-b-scope` F-B1.
 *
 * Exercised with injected edges (fetch / storage / clock), the same pattern as account_module.cjs,
 * so the whole thing runs in Node with no browser and no network.
 */
const { createSync } = require('../lib/shared/sync.js');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};
const MS = 1786000000000;
const roster = (chars) => JSON.stringify({ version: 1, characters: chars });

function harness(routes, seed, refuse) {
  const calls = [];
  const mem = Object.assign({}, seed || {});
  const events = [];
  const edges = {
    fetch: (url, opts) => {
      calls.push({ url, opts: opts || {}, body: opts && opts.body ? JSON.parse(opts.body) : null });
      const r = routes[(opts && opts.method) === 'PUT' ? 'PUT ' + url : url];
      if (!r) return Promise.reject(new Error('unrouted ' + url));
      return Promise.resolve(typeof r === 'function' ? r(opts, calls) : r);
    },
    storage: { get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { if (refuse && refuse(k)) throw new Error('quota'); mem[k] = v; } },
    schedule: (fn) => { fn(); return 1; },       // fire debounces immediately
  };
  const s = createSync(edges);
  s.subscribe((t, d) => events.push({ t, d }));
  return { s, calls, mem, events };
}
const ok = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });
const conflict = (body) => ({ ok: false, status: 409, json: () => Promise.resolve(body) });
// pushNow fetches inside a promise chain, so a sweep's request lands on a microtask rather than
// inline. Every count-the-requests assert has to yield first or it reads the number from before
// the work happened — which is how the first draft of the C-CP-1 asserts "found" a bug that was
// its own impatience.
const tick = () => new Promise((r) => setTimeout(r, 5));

(async () => {
  console.log('sync_seam — pull, push, and losing the race\n');

  // ── the key list has ONE home ──────────────────────────────────────────────
  {
    const { s } = harness({});
    // TEN since ruling `f5-map-pins` §3 (R-F5-1) added `swrpg_map_pins` to syncMerge's WHOLE. This
    // assert went red on that one edit with nothing touched in sync.js, which is the property it
    // was written to hold: the seam's list is DERIVED from the merge module, so registering a key
    // in one place registers push and pull too. Re-pointed on the ruling, not to match the code.
    // ELEVEN since ruling `shipyard-s3-contracts` R-S3K-5 (K5, `swrpg_fleet_units_v1`), built in S4 JOB 2
    // (R-S4G-17): registered in syncMerge's LISTS, so the seam picked it up with no edit to sync.js — the same
    // property. Re-pointed on the ruling; KEEPS "one list, derived", the count moves 10 → 11.
    // TWELVE since ruling `release-r4-shapes` R-R4S-5 item 3 (the group record, `swrpg_party_v1`; R6 lane A): registered
    // in syncMerge's LISTS, picked up with no edit to sync.js. KEEPS "one list, derived"; the count moves 11 → 12.
    // THIRTEEN since ruling `encounters-e6-plumbing` ADDENDUM 1, C2 (the campaign record, `swrpg_campaigns`): registered in syncMerge's
    // LISTS, picked up with no edit to sync.js. KEEPS "one list, derived"; the count moves 12 → 13.
    // FOURTEEN since ruling `between-sessions-build-paper` R-BSBP-7 (the wish list, `swrpg_store_holds_v2`): registered in
    // syncMerge's LISTS, picked up with no edit to sync.js. KEEPS "one list, derived"; the count moves 13 → 14.
    check('the seam syncs exactly fourteen keys, taken from the merge module not a second copy',
      s.syncedKeys().length === 14, s.syncedKeys());
    check('and the fourteenth is the wish list (R-BSBP-7)', s.syncedKeys().indexOf('swrpg_store_holds_v2') >= 0 && s.syncedKeys().indexOf('swrpg_store_holds_v1') === -1, s.syncedKeys());
    check('and the thirteenth is the campaign record (E6 C2)', s.syncedKeys().indexOf('swrpg_campaigns') >= 0, s.syncedKeys());
    check('and the twelfth is the group record (R-R4S-5)', s.syncedKeys().indexOf('swrpg_party_v1') >= 0, s.syncedKeys());
    check('and the eleventh is the fleet units (K5, R-S3K-5)', s.syncedKeys().indexOf('swrpg_fleet_units_v1') >= 0, s.syncedKeys());
    check('and the tenth is the map pins (R-F5-1)', s.syncedKeys().indexOf('swrpg_map_pins') >= 0, s.syncedKeys());
    // RE-POINTED by card `f100-ms-build` R-MSB-5: the seam's localStorage key list stays the eleven — the homebrew
    // families ride their OWN lane (R-HSC-15), never readLocal/writeLocal. KEEPS "one list, derived, eleven"; DROPS
    // nothing. The lane itself is test/ms_pack_lane.cjs.
    check('no homebrew family is in the localStorage key list (R-HSC-15)', s.syncedKeys().every((k) => k.indexOf('swrpg_user_pack') !== 0), s.syncedKeys());
    check('shelves and holds are not among them',
      s.syncedKeys().indexOf('swrpg_store_shelves_v1') === -1
      && s.syncedKeys().indexOf('swrpg_store_holds_v1') === -1);
  }

  // ── pull ───────────────────────────────────────────────────────────────────
  {
    const { s, calls } = harness({
      '/api/v1/sync': ok({ ok: true, keys: { swrpg_mods: { value: '["x"]', version: 3 } } }),
    });
    const r = await s.pull();
    check('pull parses values and records versions',
      r.ok && r.values.swrpg_mods[0] === 'x' && r.versions.swrpg_mods === 3);
    check('pull sends credentials (the session cookie IS the request)',
      calls[0].opts.credentials === 'include');
  }
  {
    const { s } = harness({});                    // every fetch rejects
    const r = await s.pull();
    check('a dead API resolves rather than throwing — the app is never broken by sync',
      r.ok === false && Object.keys(r.values).length === 0);
  }

  // ── adopt: the merge, applied and pushed ───────────────────────────────────
  {
    const seed = { swrpg_saved_characters: roster([{ id: 'local1', name: 'Laptop' }]) };
    const { s, mem, calls, events } = harness({
      '/api/v1/sync': ok({ ok: true, keys: {
        swrpg_saved_characters: { value: roster([{ id: 'remote1', name: 'Phone' }]), version: 2 },
      } }),
      'PUT /api/v1/sync/swrpg_saved_characters': ok({ ok: true, version: 3 }),
      'PUT /api/v1/sync/swrpg_deleted_ids': ok({ ok: true, version: 1 }),
    }, seed);
    const r = await s.adopt();
    const merged = JSON.parse(mem.swrpg_saved_characters).characters.map((c) => c.id).sort();
    check('adopt writes the UNION back to local storage', merged.join() === 'local1,remote1', merged);
    check('adopt pushes the merged value up, conditional on the version it pulled',
      calls.some((c) => c.url.endsWith('/swrpg_saved_characters') && c.body && c.body.version === 2));
    check('adopt reports no conflicts when the merge was unambiguous', r.conflicts.length === 0);
    check('adopt announces itself once', events.filter((e) => e.t === 'adopted').length === 1);
  }
  {
    // Same record, both sides changed, no comparable stamps → the prompt, not a guess.
    const seed = { swrpg_saved_characters: roster([{ id: 'a', name: 'Mine' }]) };
    const { s, mem } = harness({
      '/api/v1/sync': ok({ ok: true, keys: {
        swrpg_saved_characters: { value: roster([{ id: 'a', name: 'Theirs' }]), version: 1 },
      } }),
      'PUT /api/v1/sync/swrpg_saved_characters': ok({ ok: true, version: 2 }),
      'PUT /api/v1/sync/swrpg_deleted_ids': ok({ ok: true, version: 1 }),
    }, seed);
    const r = await s.adopt();
    check('adopt surfaces an unresolvable record as a conflict', r.conflicts.length === 1);
    check('...and leaves the local value in place until it is answered',
      JSON.parse(mem.swrpg_saved_characters).characters[0].name === 'Mine');
  }

  // ── push: debounced, conditional ───────────────────────────────────────────
  {
    const seed = { swrpg_mods: '["a"]' };
    const { s, calls } = harness({ 'PUT /api/v1/sync/swrpg_mods': ok({ ok: true, version: 1 }) }, seed);
    s.push('swrpg_mods');
    await new Promise((r) => setTimeout(r, 5));
    check('push sends the value and the version it believes',
      calls.length === 1 && calls[0].body.version === 0 && calls[0].body.value === '["a"]');
    check('push sends the value as a STRING (the server stores it verbatim)',
      typeof calls[0].body.value === 'string');
    check('the new version is remembered for the next write', s._versions().swrpg_mods === 1);
  }
  {
    // The excluded key is SEEDED, so the allow-list is the only thing that can stop the push. The
    // first version of this assert left storage empty — push then bailed because there was nothing
    // to read, and it passed with the allow-list deleted. A test that passes for the wrong reason
    // is the R-UNH-1 class, and mutation is how it got caught.
    const { s, calls } = harness(
      { 'PUT /api/v1/sync/swrpg_store_shelves_v1': ok({ ok: true, version: 1 }) },
      { swrpg_store_shelves_v1: '{"shelves":[]}' });
    s.push('swrpg_store_shelves_v1');
    await new Promise((r) => setTimeout(r, 5));
    check('a key outside the ruled set is never pushed, even when it HAS a local value',
      calls.length === 0, calls.map((c) => c.url));
  }

  // ── the other device got there first ───────────────────────────────────────
  {
    const seed = { swrpg_saved_characters: roster([{ id: 'mine', name: 'Just made this' }]) };
    let puts = 0;
    const { s, mem, calls } = harness({
      'PUT /api/v1/sync/swrpg_saved_characters': (opts) => {
        puts += 1;
        if (puts === 1) {
          return conflict({ ok: false, error: 'version_conflict',
            current: { value: roster([{ id: 'theirs', name: 'From the phone' }]), version: 7 } });
        }
        return ok({ ok: true, version: 8 });
      },
    }, seed);
    await s.pushNow('swrpg_saved_characters', JSON.parse(seed.swrpg_saved_characters));
    const after = JSON.parse(mem.swrpg_saved_characters).characters.map((c) => c.id).sort();
    check('409: THE LOCAL WORK IS NOT DISCARDED — it merges with what the other device wrote',
      after.join() === 'mine,theirs', after);
    check('409: the reconciled value is pushed again, at the version the server reported',
      calls.filter((c) => c.opts.method === 'PUT').length === 2 && calls.filter((c) => c.opts.method === 'PUT')[1].body.version === 7);
    check('409: and the version lands on the retry\'s result', s._versions().swrpg_saved_characters === 8);
  }
  {
    // A 409 whose merge is NOT clean must ask rather than retry blindly.
    const seed = { swrpg_saved_characters: roster([{ id: 'a', name: 'Mine' }]) };
    const { s, calls, events } = harness({
      'PUT /api/v1/sync/swrpg_saved_characters': conflict({ ok: false, error: 'version_conflict',
        current: { value: roster([{ id: 'a', name: 'Theirs' }]), version: 4 } }),
    }, seed);
    const r = await s.pushNow('swrpg_saved_characters', JSON.parse(seed.swrpg_saved_characters));
    check('409 with an unresolvable record does NOT retry blindly', calls.filter((c) => c.opts.method === 'PUT').length === 1 && r.conflict === true);
    check('...it raises a conflict for the prompt', events.some((e) => e.t === 'conflict'));
    check('...and the conflict is retrievable', s.conflicts().length === 1);
  }
  {
    // C-SC-1 — the retry is BOUNDED. A server that keeps moving under us (two devices writing the
    // same key faster than a round trip) used to recurse without limit, while the comment beside it
    // claimed "retry once". Every merge here is CLEAN — each 409 carries a brand-new id, so the
    // union always succeeds — which is precisely the shape that retries forever rather than
    // stopping at a conflict.
    //
    // The fake server yields after 50 conflicts ON PURPOSE. If the bound were removed, this would
    // otherwise spin until the stack died and take the suite with it; instead the run terminates
    // and the count assert FAILS with a nameable number. A guard that hangs on its own mutant is
    // not a guard.
    const seed = { swrpg_saved_characters: roster([{ id: 'mine', name: 'Mine' }]) };
    let puts = 0;
    const { s, mem, calls, events } = harness({
      'PUT /api/v1/sync/swrpg_saved_characters': () => {
        puts += 1;
        if (puts > 50) return ok({ ok: true, version: 999 });
        return conflict({ ok: false, error: 'version_conflict',
          current: { value: roster([{ id: 'other' + puts, name: 'Other device ' + puts }]), version: puts } });
      },
    }, seed);
    const r = await s.pushNow('swrpg_saved_characters', JSON.parse(seed.swrpg_saved_characters));
    check('C-SC-1: an endlessly-moving server does NOT retry forever — it stops at three pushes',
      calls.filter((c) => c.opts.method === 'PUT').length === 3, calls.length);
    check('C-SC-1: it gives up as an UNSENT write, not a success',
      r.ok === false && r.error === 'conflict_retry_exhausted', r);
    check('C-SC-1: and it takes F-B4\'s voice — push_failed, which the chip already renders',
      events.some((e) => e.t === 'push_failed' && e.d.error === 'conflict_retry_exhausted'),
      events.map((e) => e.t));
    // The whole justification for giving up rather than discarding: the work is still HERE.
    const local = JSON.parse(mem.swrpg_saved_characters).characters.map((c) => c.id).sort();
    check('C-SC-1: NO WORK IS LOST — the device still holds its own record plus every one it merged',
      local.indexOf('mine') !== -1 && local.indexOf('other1') !== -1 && local.indexOf('other2') !== -1,
      local);
  }

  // ── the watcher: a write cannot be missed, whoever made it ─────────────────
  {
    const { s, calls, mem } = harness(
      { 'PUT /api/v1/sync/swrpg_mods': ok({ ok: true, version: 1 }) },
      { swrpg_mods: '["a"]' });
    s.primeSnapshot();
    s.sweep();
    await new Promise((r) => setTimeout(r, 5));
    check('an unchanged key is not pushed (the sweep is a diff, not a heartbeat)', calls.length === 0);
    mem.swrpg_mods = '["a","b"]';                 // a write by ANY code path
    s.sweep();
    await new Promise((r) => setTimeout(r, 5));
    check('a changed key IS pushed, without the store having told sync anything',
      calls.length === 1 && calls[0].body.value === '["a","b"]');
    s.sweep();
    await new Promise((r) => setTimeout(r, 5));
    check('and it is not pushed twice for the same value', calls.length === 1);
  }
  {
    const { s, calls } = harness(
      { 'PUT /api/v1/sync/swrpg_store_shelves_v1': ok({ ok: true, version: 1 }) },
      { swrpg_store_shelves_v1: '{"shelves":[]}' });
    s.primeSnapshot();
    s.sweep();
    await new Promise((r) => setTimeout(r, 5));
    check('the sweep only ever looks at the ruled keys', calls.length === 0);
  }

  // ── failure has a voice (F-B4's exception) ─────────────────────────────────
  {
    const { s, events } = harness({}, { swrpg_mods: '["a"]' });
    const r = await s.pushNow('swrpg_mods', ['a']);
    check('a failed push resolves rather than throwing', r.ok === false);
    check('a failed push is ANNOUNCED — silence here is the failure F-B4 was written against',
      events.some((e) => e.t === 'push_failed'));
  }

  // ── C-CP-1: THE HOLD (ruling f34-conflict-prompt §3a) ──────────────────────
  // Every assert below is SEEDED so the guard is examining something: the R-UNH-1 lesson this lap
  // already paid for once, where "a key outside the ruled set is never pushed" passed with the
  // allow-list deleted because the key was never in storage to begin with.
  {
    // adopt(): a conflicted key must NOT be pushed, while a clean key in the SAME adoption is.
    // Both halves matter — a hold that holds everything is not a hold, it is an outage.
    const seed = {
      swrpg_active_sources: JSON.stringify(['eote', 'aor']),      // will conflict (whole-envelope)
      swrpg_mods: JSON.stringify(['clean']),                      // identical on both sides
      swrpg_npc_cast: JSON.stringify({ npcs: [{ _source_key: 'only-here', name: 'Local NPC' }] }),
    };
    const { s, calls, mem } = harness({
      '/api/v1/sync': ok({ ok: true, keys: {
        swrpg_active_sources: { value: JSON.stringify(['eote', 'fad', 'ffg']), version: 4 },
        swrpg_mods: { value: JSON.stringify(['clean']), version: 2 },
      } }),
      'PUT /api/v1/sync/swrpg_npc_cast': ok({ ok: true, version: 1 }),
      'PUT /api/v1/sync/swrpg_active_sources': ok({ ok: true, version: 5 }),
      'PUT /api/v1/sync/swrpg_mods': ok({ ok: true, version: 3 }),
    }, seed);
    const r = await s.adopt();
    const pushed = calls.filter((c) => (c.opts.method === 'PUT')).map((c) => c.url.split('/').pop());
    check('C-CP-1 setup: adoption really did raise a conflict on the seeded key (non-vacuous)',
      r.conflicts.length === 1 && r.conflicts[0].key === 'swrpg_active_sources', r.conflicts);
    check('C-CP-1 adopt(): the CONFLICTED key is NOT pushed — the account keeps its version',
      pushed.indexOf('swrpg_active_sources') === -1, pushed);
    check('C-CP-1 adopt(): a CLEAN key in the same adoption still IS pushed (a hold, not an outage)',
      pushed.indexOf('swrpg_npc_cast') !== -1, pushed);
    check('C-CP-1: the seam reports the key as held', s.isHeld('swrpg_active_sources') === true);
    check('C-CP-1: local still holds the provisional answer, so the app keeps working',
      JSON.parse(mem.swrpg_active_sources).join() === 'eote,aor', mem.swrpg_active_sources);
  }
  {
    // sweep(): the background path. A conflicted key that CHANGES must still not go up — and the
    // change must not be forgotten, or answering the question would leave the key unsynced until
    // it happened to change again.
    const seed = { swrpg_active_sources: JSON.stringify(['eote']) };
    let remote = JSON.stringify(['fad']);          // differs → conflict
    const { s, calls, mem } = harness({
      '/api/v1/sync': () => ok({ ok: true, keys: {
        swrpg_active_sources: { value: remote, version: 4 },
      } }),
      'PUT /api/v1/sync/swrpg_active_sources': ok({ ok: true, version: 5 }),
    }, seed);
    const puts = () => calls.filter((c) => c.opts.method === 'PUT').length;

    await s.adopt();
    s.primeSnapshot();
    check('C-CP-1 sweep: setup is non-vacuous — the key is genuinely held right now',
      s.isHeld('swrpg_active_sources') === true);

    const before = puts();
    mem.swrpg_active_sources = JSON.stringify(['eote', 'edited']);   // the person edits it anyway
    s.sweep();
    await tick();                                  // pushNow fetches on a microtask, not inline
    check('C-CP-1 sweep: a held key that CHANGED is still not pushed',
      puts() === before, { before, after: puts() });

    // The snapshot must NOT have recorded that edit as "seen". Lift the hold the way the world
    // lifts it — the other device settles, so a recheck finds the sides agree — and the very next
    // sweep has to send the edit that happened while we were holding. This is the assert that
    // catches the tempting version of the fix, where sweep updates its snapshot and then returns.
    remote = JSON.stringify(['eote', 'edited']);
    await s.recheck();
    check('C-CP-1: once the sides agree, the hold lifts', s.isHeld('swrpg_active_sources') === false);
    const beforeRelease = puts();
    s.sweep();
    await tick();
    check('C-CP-1: and the edit made DURING the hold is not forgotten — it goes up now',
      puts() === beforeRelease + 1, { beforeRelease, after: puts() });
  }

  {
    // push() carries its OWN hold guard, and it needs its own assert: a mutation showed every
    // sweep-based assert above still passes with push()'s guard deleted, because sweep refuses
    // first and push is never reached with a held key. push() is public API, so a direct caller
    // is a real path — and an unasserted guard is one someone deletes as dead code later.
    const seed = { swrpg_active_sources: JSON.stringify(['eote']) };
    const { s, calls } = harness({
      '/api/v1/sync': ok({ ok: true, keys: {
        swrpg_active_sources: { value: JSON.stringify(['fad']), version: 4 },
      } }),
      'PUT /api/v1/sync/swrpg_active_sources': ok({ ok: true, version: 5 }),
    }, seed);
    await s.adopt();
    check('C-CP-1 push(): setup is non-vacuous — the key is held', s.isHeld('swrpg_active_sources'));
    const before = calls.filter((c) => c.opts.method === 'PUT').length;
    s.push('swrpg_active_sources');                // the direct path, bypassing sweep entirely
    await tick();
    check('C-CP-1 push(): a DIRECT push of a held key is refused too',
      calls.filter((c) => c.opts.method === 'PUT').length === before, calls.length);
  }

  // ── C-CP-3: answering rides the NORMAL push path ───────────────────────────
  {
    // "Your account" on a whole-envelope question: the account's value becomes this device's,
    // and it goes up the ordinary way. The prompt has no private write path to either side.
    const seed = { swrpg_active_sources: JSON.stringify(['eote', 'aor']) };
    const { s, calls, mem, events } = harness({
      '/api/v1/sync': ok({ ok: true, keys: {
        swrpg_active_sources: { value: JSON.stringify(['fad']), version: 4 },
      } }),
      'PUT /api/v1/sync/swrpg_active_sources': ok({ ok: true, version: 5 }),
    }, seed);
    const r = await s.adopt();
    check('C-CP-3 setup: one open question (non-vacuous)', r.conflicts.length === 1, r.conflicts);
    const res = await s.resolve(r.conflicts[0], 'remote');
    await tick();
    check('C-CP-3 "your account": the account\'s value is now this device\'s',
      JSON.parse(mem.swrpg_active_sources).join() === 'fad', mem.swrpg_active_sources);
    check('C-CP-3: the hold lifts once the question is answered',
      s.isHeld('swrpg_active_sources') === false && s.conflicts().length === 0);
    const puts = calls.filter((c) => c.opts.method === 'PUT' && c.url.indexOf('active_sources') !== -1);
    check('C-CP-3: it went up through the ORDINARY push — version-conditional, same endpoint',
      puts.length === 1 && puts[0].body.version === 4 && res.ok === true, { puts: puts.length, res });
    check('C-CP-3: answering is announced, so the chip can drop its count',
      events.some((e) => e.t === 'resolved' && e.d.side === 'remote' && e.d.remaining === 0),
      events.map((e) => e.t));
  }
  {
    // "This device" on a per-record question: the local record stays, the account's is discarded
    // BY THE PERSON — which is the only actor allowed to discard it.
    const seed = { swrpg_saved_characters: roster([{ id: 'kira', name: 'Kira (laptop)' }]) };
    const { s, calls, mem } = harness({
      '/api/v1/sync': ok({ ok: true, keys: {
        swrpg_saved_characters: { value: roster([{ id: 'kira', name: 'Kira (phone)' }]), version: 6 },
      } }),
      'PUT /api/v1/sync/swrpg_saved_characters': ok({ ok: true, version: 7 }),
    }, seed);
    const r = await s.adopt();
    check('C-CP-3 setup: a per-record question, both sides carried',
      r.conflicts.length === 1 && r.conflicts[0].remote.name === 'Kira (phone)', r.conflicts);
    await s.resolve(r.conflicts[0], 'local');
    await tick();
    const chars = JSON.parse(mem.swrpg_saved_characters).characters;
    check('C-CP-3 "this device": the chosen record is the one that survives, exactly once',
      chars.length === 1 && chars[0].name === 'Kira (laptop)', chars);
    const puts = calls.filter((c) => c.opts.method === 'PUT' && c.url.indexOf('saved_characters') !== -1);
    check('C-CP-3: and the answer is pushed, so the account stops disagreeing', puts.length === 1);
  }
  {
    // A record that is absent locally but NOT deleted — e.g. one this device never had — is a
    // legitimate restore: adding it is the answer the person gave.
    const seed = { swrpg_saved_characters: roster([]) };
    const { s, mem } = harness({
      'PUT /api/v1/sync/swrpg_saved_characters': ok({ ok: true, version: 2 }),
    }, seed);
    const fake = { key: 'swrpg_saved_characters', id: 'never_had', kind: 'record',
      local: { id: 'never_had', name: 'Local' }, remote: { id: 'never_had', name: 'From the account' } };
    await s.resolve(fake, 'remote');
    await tick();
    const chars = JSON.parse(mem.swrpg_saved_characters).characters;
    check('C-CP-3: choosing the account\'s copy of an absent, NOT-deleted record adds it',
      chars.length === 1 && chars[0].name === 'From the account', chars);
  }
  {
    // ── C-CP-5: DELETION MOOTS THE QUESTION ────────────────────────────────
    // The defect this replaces was true for exactly one render. The old assert seeded an EMPTY
    // roster with NO tombstone — so it tested "absent", never "deleted" — and it stopped at the
    // restore without ever running the merge that follows. Both halves are fixed here: the
    // fixture is genuinely DELETED, and the story continues past the answer.
    const seed = {
      swrpg_saved_characters: roster([]),
      swrpg_deleted_ids: JSON.stringify(['gone']),      // the person deleted it, deliberately
    };
    const { s, mem, calls, events } = harness({
      '/api/v1/sync': ok({ ok: true, keys: {
        swrpg_saved_characters: { value: roster([{ id: 'gone', name: 'From the account' }]), version: 6 },
        swrpg_deleted_ids: { value: JSON.stringify([]), version: 1 },
      } }),
      'PUT /api/v1/sync/swrpg_saved_characters': ok({ ok: true, version: 7 }),
      'PUT /api/v1/sync/swrpg_deleted_ids': ok({ ok: true, version: 2 }),
    }, seed);
    const dead = { key: 'swrpg_saved_characters', id: 'gone', kind: 'record',
      local: { id: 'gone', name: 'Local' }, remote: { id: 'gone', name: 'From the account' } };
    const before = calls.filter((c) => c.opts.method === 'PUT').length;
    const r = await s.resolve(dead, 'remote');
    await tick();
    check('C-CP-5: answering "your account" for a DELETED record is refused, not performed',
      r.ok === false && r.error === 'record_deleted', r);
    check('C-CP-5: the record stays deleted — no restore that the next merge would undo',
      JSON.parse(mem.swrpg_saved_characters).characters.length === 0,
      mem.swrpg_saved_characters);
    check('C-CP-5: and nothing was pushed on the strength of an answer we could not honour',
      calls.filter((c) => c.opts.method === 'PUT').length === before, calls.length);
    check('C-CP-5: the question CLOSES — the deletion is the answer',
      s.conflicts().length === 0 && events.some((e) => e.t === 'resolved' && e.d.side === 'deleted'),
      events.map((e) => e.t));
  }
  {
    // THE SURVIVAL ASSERT — the one whose absence let the false claim pass review. Any restore-
    // shaped fixture must run the merge that FOLLOWS the answer, because the tombstone union is
    // applied there, not at the moment of answering. Testing one render tested nothing.
    const seed = {
      swrpg_saved_characters: roster([{ id: 'gone', name: 'Restored' }]),
      swrpg_deleted_ids: JSON.stringify(['gone']),
    };
    const { s, mem } = harness({
      '/api/v1/sync': ok({ ok: true, keys: {
        swrpg_saved_characters: { value: roster([{ id: 'gone', name: 'From the account' }]), version: 6 },
        swrpg_deleted_ids: { value: JSON.stringify([]), version: 1 },
      } }),
      'PUT /api/v1/sync/swrpg_saved_characters': ok({ ok: true, version: 7 }),
    }, seed);
    await s.recheck();
    await tick();
    check('C-CP-5 survival: a tombstoned record does NOT survive the next merge — which is exactly '
      + 'why restoring one may not be offered',
      JSON.parse(mem.swrpg_saved_characters).characters.length === 0,
      mem.swrpg_saved_characters);
    check('C-CP-5: ...and no open question is left dangling for a record that is gone',
      s.conflicts().length === 0, s.conflicts());
  }
  {
    // A key with TWO open questions stays held until BOTH are answered. A per-key hold released by
    // the first answer would push a value that still contains an unanswered one.
    const seed = { swrpg_saved_characters: roster([
      { id: 'a', name: 'A here' }, { id: 'b', name: 'B here' }]) };
    const { s, calls } = harness({
      '/api/v1/sync': ok({ ok: true, keys: {
        swrpg_saved_characters: { value: roster([
          { id: 'a', name: 'A there' }, { id: 'b', name: 'B there' }]), version: 3 },
      } }),
      'PUT /api/v1/sync/swrpg_saved_characters': ok({ ok: true, version: 4 }),
    }, seed);
    const r = await s.adopt();
    check('C-CP-3 setup: two open questions on ONE key (non-vacuous)', r.conflicts.length === 2);
    const first = await s.resolve(r.conflicts[0], 'local');
    await tick();
    const putsAfterFirst = calls.filter((c) => c.opts.method === 'PUT'
      && c.url.indexOf('saved_characters') !== -1).length;
    check('C-CP-3: one answer does NOT release the key — the other question is still open',
      first.held === true && s.isHeld('swrpg_saved_characters') === true && putsAfterFirst === 0,
      { first, puts: putsAfterFirst });
    await s.resolve(r.conflicts[1], 'local');
    await tick();
    const putsAfterBoth = calls.filter((c) => c.opts.method === 'PUT'
      && c.url.indexOf('saved_characters') !== -1).length;
    check('C-CP-3: the LAST answer releases it and sends one push',
      s.isHeld('swrpg_saved_characters') === false && putsAfterBoth === 1, putsAfterBoth);
  }
  {
    const { s } = harness({});
    const bad = await s.resolve({ key: 'swrpg_mods', kind: 'envelope' }, 'sideways');
    check('C-CP-3: an unrecognised choice is refused rather than guessed', bad.ok === false);
  }

  // RE-POINTED by R-MSB-5 (R-HSC-15): a pulled pack row is handed to the pack lane and NEVER written to localStorage;
  // the localStorage half of adoption is byte-for-byte today's. KEEPS every adoption assert above; ADDS the seam's
  // half of the lane's admission.
  {
    const handed = [];
    const seed = { swrpg_saved_characters: roster([{ id: 'a', name: 'A' }]) };
    const routes = {
      '/api/v1/sync': ok({ ok: true, keys: {
        swrpg_saved_characters: { value: roster([{ id: 'a', name: 'A' }]), version: 2 },
        'swrpg_user_pack:0123456789ab': { value: '{"enc":"gone"}', version: 3 },
        swrpg_user_pack_meta: { value: '{"v":1,"active":{},"order":[]}', version: 1 },
      } }),
    };
    const calls = [], mem = Object.assign({}, seed);
    const s = createSync({
      fetch: (url, opts) => { calls.push({ url, opts: opts || {} }); const r = routes[(opts && opts.method) === 'PUT' ? 'PUT ' + url : url]; return r ? Promise.resolve(r) : Promise.reject(new Error('unrouted ' + url)); },
      storage: { get: (k) => (k in mem ? mem[k] : null), set: (k, v) => { mem[k] = v; } },
      schedule: (fn) => { fn(); return 1; },
      packs: () => ({ status: () => ({ writable: true }), ready: () => Promise.resolve(), syncSnapshot: () => ({ own: [], meta: { v: 1, active: {}, order: [] }, metaSynced: null }),
        list: () => [], versions: () => [], receiveTombstone: (inst) => { handed.push('tomb:' + inst); return Promise.resolve({ ok: true }); },
        receiveMeta: (m, o) => { handed.push('meta:' + (o && o.ver)); return Promise.resolve({ ok: true }); } }),
      compress: { gzip: (t) => Promise.resolve(Buffer.from(t).toString('base64')), gunzip: (b) => Promise.resolve(Buffer.from(b, 'base64').toString()) },
    });
    await s.adopt();
    await tick();
    check('R-HSC-15: no homebrew key reaches localStorage on adoption', Object.keys(mem).every((k) => k.indexOf('swrpg_user_pack') !== 0), Object.keys(mem));
    check('R-HSC-15: the pulled pack rows are handed to the lane (a tombstone and the meta row)', handed.indexOf('tomb:0123456789ab') !== -1 && handed.indexOf('meta:1') !== -1, handed);
  }

  // ── ruling `release-r7-bug-burndown` ADDENDUM 518: the 409's local side is what the store holds in the turn that merges and writes ──
  {
    const seed = { swrpg_saved_characters: roster([{ id: 'mine', name: 'As sent' }]) };
    const sent = JSON.parse(seed.swrpg_saved_characters);
    const h = harness({
      'PUT /api/v1/sync/swrpg_saved_characters': (opts, calls) => (calls.filter((c) => c.opts.method === 'PUT').length === 1
        ? conflict({ ok: false, current: { value: roster([{ id: 'theirs', name: 'From the phone' }]), version: 7 } }) : ok({ ok: true, version: 8 })),
      '/api/v1/sync': () => {                          // entered while the tombstones' GET was out
        h.mem.swrpg_saved_characters = roster([{ id: 'mine', name: 'Typed during the GET' }]);
        return ok({ ok: true, keys: {} });
      },
    }, seed);
    await h.s.pushNow('swrpg_saved_characters', sent);
    const after = JSON.parse(h.mem.swrpg_saved_characters).characters;
    check('518: what was entered during the tombstones\' GET survives the 409', (after.find((c) => c.id === 'mine') || {}).name === 'Typed during the GET', after);
    check('518: the other device\'s record lands beside it', after.some((c) => c.id === 'theirs'), after);
    const lastPut = JSON.parse(h.calls.filter((c) => c.opts.method === 'PUT').pop().body.value).characters;
    check('518: and the re-push carries both', lastPut.length === 2 && (lastPut.find((c) => c.id === 'mine') || {}).name === 'Typed during the GET', lastPut);
  }
  for (const [word, spoil] of [['unparsable', (m) => { m.swrpg_saved_characters = '{not json'; }], ['null', (m) => { delete m.swrpg_saved_characters; }], ['a stored null', (m) => { m.swrpg_saved_characters = 'null'; }]]) {
    const seed = { swrpg_saved_characters: roster([{ id: 'mine', name: 'As sent' }]) };
    const h = harness({
      'PUT /api/v1/sync/swrpg_saved_characters': (opts, calls) => {
        if (calls.filter((c) => c.opts.method === 'PUT').length > 1) return ok({ ok: true, version: 8 });
        spoil(h.mem);
        return conflict({ ok: false, current: { value: roster([{ id: 'theirs', name: 'From the phone' }]), version: 7 } });
      },
      '/api/v1/sync': ok({ ok: true, keys: {} }),
    }, seed);
    await h.s.pushNow('swrpg_saved_characters', JSON.parse(seed.swrpg_saved_characters));
    const ids = JSON.parse(h.calls.filter((c) => c.opts.method === 'PUT').pop().body.value).characters.map((c) => c.id).sort();
    check('518: a store reading ' + word + ' falls back to what was sent', ids.join() === 'mine,theirs', ids);
  }
  {
    // THE QUOTA CASE, driven (518 contract 4): the local write is refused, adoption pushes the merge, and a 409 answers. No record leaves the union.
    const seed = { swrpg_saved_characters: roster([{ id: 'here', name: 'Only here' }]) };
    let puts = 0;
    const h = harness({
      '/api/v1/me': ok({ ok: true, user: { id: 'u1' } }),
      '/api/v1/sync': ok({ ok: true, keys: { swrpg_saved_characters: { value: roster([{ id: 'there', name: 'At the account' }]), version: 5 } } }),
      'PUT /api/v1/sync/swrpg_saved_characters': () => {
        puts += 1;
        return puts === 1 ? conflict({ ok: false, current: { value: roster([{ id: 'there', name: 'At the account' }, { id: 'later', name: 'Written since' }]), version: 6 } }) : ok({ ok: true, version: 7 });
      },
    }, seed, (k) => k === 'swrpg_saved_characters');
    await h.s.adopt();
    await tick();
    const bodies = h.calls.filter((c) => c.opts.method === 'PUT' && /saved_characters/.test(c.url)).map((c) => JSON.parse(c.body.value).characters.map((r) => r.id).sort().join());
    check('518 quota: the store refused the write, so it still holds the older copy', JSON.parse(h.mem.swrpg_saved_characters).characters.length === 1, h.mem.swrpg_saved_characters);
    check('518 quota: adoption pushed the merge, and the 409 was met', bodies.length === 2 && bodies[0] === 'here,there', bodies);
    check('518 quota: no record leaves the union', bodies[1] === 'here,later,there', bodies);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

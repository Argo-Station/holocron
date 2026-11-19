/* lib/shared/campaignsView.jsx — THE CAMPAIGNS SCREENS (window.SWRPGCampaignsView), both apps' faces in one module.
 *
 * Ruling `encounters-e6-frames` §3 step 1 + ADDENDUM 2; the approved pages `Docs/mockups/campaigns-{gm,player}.html`
 * (LAW, C-MU-4) and round e6f's D3, D4 and D6 (D-540). Copy is `Docs/mockups/assets/campaigns/paint.js`'s, verbatim.
 *
 * F5-a: CAMPAIGNS is its own host screen. This module draws its own shell in the library shell's classes
 * (`hp-sheet nl-scr nl`, `data-npc-shell`, `nl-head` / `nl-back` / `nl-title`, `nl-body`) rather than mounting
 * NpcLibrary, so npc.css / encounters.css style it as they style the bench, and the sheets portal into it.
 *
 *   GM      G2 the list · G3 one campaign (its LOG, D3's NEW SESSION, G5's SEND XP) · G4 the OPEN TABLE sheet
 *   player  P2 the list · P3 JOIN TABLE (D4 knocking by code; no SCAN at any width, D-543) · P4 put it where · P5 one campaign
 *
 * T2 (ruling `encounters-t2-build` item 5; the approved `Docs/mockups/campaigns-t2.html` @ 951d73494, LAW by D-622; copy
 * its paint.js's, verbatim), with `swrpg_table_memory_door` ON (tableSession `doorOn`): M3 G4's remembered players with
 * FORGET (asking once, above AT THE TABLE, ADDENDUM 4), the newcomers' code after them when the night has remembered players (D-T2M5 (b)); M4 P5's
 * waiting, wait-ended and turned-away rows; M5 G3's SESSIONS above LOG, each night's SESSION lines under it, a closed
 * night's SENT line alone (R-T2TM-1), DELETE asking once; M6 the rows' OPEN TABLE / JOIN. OFF, every screen is E6's.
 *
 * Reads SWRPGCampaigns, SWRPGParty and SWRPGRoster; acts on the wire only through SWRPGTableSession. Writes only through
 * those modules' writers. The host owns the route: props.route = { id } | { join: code } | {}; props.go(route) moves.
 * Classic-script transform (build/sources.mjs TRANSFORMS) → loads after vendor.js; React is global.
 */
(function () {
  'use strict';
  const { useState, useEffect, useRef } = React;

  const CANT_REACH = "Can't reach the table right now — try again";   // ruling `encounters-e6-wire-online` §8 item 4, verbatim
  const ERR = { no_table: 'No table with that code', refused: 'The GM said no', slow_down: 'Too many tries — wait a few minutes',
    full: 'This table is full', closed: 'That table has closed' };
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const TRACKS = ['obligation', 'duty', 'morality'];
  const MONO = { fontFamily: 'var(--font-mono)', letterSpacing: '.14em', textTransform: 'uppercase' };
  const ALERT = { color: 'var(--doc-critical,#7F2A14)', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 16, margin: '10px 0 0' };
  const MUTED = 'var(--doc-ink-muted,#403D38)';
  const JOIN_URL = 'https://holocron.work/player/join#';   // R-E6F-1's path: the live default that T.joinUrl also yields; the QR reads joinUrl (A4-C2). Kept, and exported, for readers

  function C() { return window.SWRPGCampaigns || null; }
  function P() { return window.SWRPGParty || null; }
  function TS() { return window.SWRPGTableSession || null; }
  function now() { return Date.now(); }
  function dateOf(at) { if (typeof at !== 'number') return ''; const d = new Date(at); return MONTHS[d.getMonth()] + ' ' + d.getDate(); }
  function showCode(code) { const s = String(code || '').replace(/-/g, '').toUpperCase(); return s.length === 6 ? s.slice(0, 3) + '-' + s.slice(3) : s; }
  // G3: the join link's QR, by the vendored qrcode-generator (public/vendor/qrcode-generator, MIT); '' without it
  function qrSvg(text) {
    const Q = window.qrcode;
    if (typeof Q !== 'function' || !text) return '';
    try { const q = Q(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); } catch (e) { return ''; }
  }
  function online() { try { return navigator.onLine !== false; } catch (e) { return true; } }

  // ── reads ──
  function chars() { const R = window.SWRPGRoster; try { return (R && R.loadSavedCharacters()) || []; } catch (e) { return []; } }
  function charRec(id) { return chars().filter(c => c && String(c.id) === String(id))[0] || null; }
  function charLine(rec) {   // encPcOf's line (lib/library/npc/view.jsx), read the same way
    const sd = rec.sheetData || {}, spec = sd.specialization || rec.specialization;
    return [rec.species || sd.species, rec.career || sd.career].filter(Boolean).join(' ') + (spec ? ' · ' + spec : '');
  }
  function partyOf(c) { const Pp = P(); return c && c.partyId && Pp ? Pp.partyOf(Pp.load(), c.partyId) : null; }
  function memberName(m) {
    const w = String(m.who || '');
    if (/^name:/.test(w)) return w.slice(5);
    const rec = charRec(w.slice(5));
    return (rec && rec.name) || m.last || 'Unnamed';
  }
  // L-1 (ADDENDUM 18): the name a SESSION item keeps — a name: who, the record's name or `last`; never the 'Unnamed' placeholder
  function keptName(m) {
    const w = String(m.who || ''), rec = /^name:/.test(w) ? null : charRec(w.slice(5));
    return String(/^name:/.test(w) ? w.slice(5) : (rec && rec.name) || m.last || '').trim();
  }
  function members(c) { const p = partyOf(c); return (p && p.members) || []; }
  // the three game lines' names (the creator's FC_GAME_LINES words); the one copy every campaigns surface reads
  const BOOK_NAMES = { eote: 'Edge of the Empire', aor: 'Age of Rebellion', fad: 'Force and Destiny' };
  function bookName(id) { return BOOK_NAMES[id] || ''; }
  function frameName(frame) { return frame && frame.book ? bookName(frame.book) || frame.book : ''; }

  // the store and the table session, re-read on every act
  function useTick() { const [, set] = useState(0); return () => set(n => n + 1); }
  function useSession() {
    const [s, set] = useState(() => (TS() ? TS().state() : {}));
    useEffect(() => (TS() ? TS().subscribe(set) : undefined), []);
    return s;
  }
  function useWide() {
    const [w, set] = useState(() => window.innerWidth);
    useEffect(() => { const f = () => set(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
    return w;
  }

  // ── parts, in paint.js's markup ──
  function Btn({ cls, children, ...rest }) { return <button type="button" className={cls || 'hp-quiet'} {...rest}>{children}</button>; }
  function Mono({ name }) { return <span className="nl-mono" aria-hidden="true">{((name || '').replace(/[^A-Za-z]/g, '')[0] || '?').toUpperCase()}</span>; }
  function Chip({ name, val }) { return <span className="nl-mchip"><Mono name={name} /><b>{name}</b>{val != null ? <span>{val}</span> : null}</span>; }
  function Sechead({ t, right }) { return <div className="hp-sechead"><h2>{t}</h2>{right || null}</div>; }
  function Dot({ on }) {   // the connected dot: filled = connected, hollow = not
    return <span aria-hidden="true" style={Object.assign({ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', flex: 'none', marginRight: 8, verticalAlign: 1 },
      on ? { background: 'var(--doc-action,#7E1414)' } : { border: '1.5px solid ' + MUTED })} />;
  }
  function Empty() {
    return <div className="hp-plate" data-pad="snug"><p className="enc-read" style={{ boxShadow: 'none', margin: 0, padding: '14px 12px' }}>No campaigns yet</p></div>;
  }
  function Pick({ on, label, sub, aria, onClick }) {
    return (
      <button type="button" className="enc-row hp-quiet" aria-pressed={on ? 'true' : 'false'} aria-label={aria || label} onClick={onClick}
        style={Object.assign({ width: '100%', textAlign: 'left', letterSpacing: 0, textTransform: 'none', padding: '4px 10px', justifyContent: 'flex-start' },
          on ? { outline: '2px solid var(--doc-action,#7E1414)', outlineOffset: -2 } : {})}>
        <span className="enc-rn">{label}{sub ? <small>{sub}</small> : null}</span>{on ? <span className="enc-tag" data-side="PC">✓</span> : null}
      </button>
    );
  }
  function NewRow({ ph, label, onAdd, style }) {
    const [v, set] = useState('');
    const go = () => { const s = v.trim(); if (!s) return; onAdd(s); set(''); };
    return (
      <div className="nl-newrow" style={style}>
        <input type="text" className="nl-in" placeholder={ph} aria-label={ph.replace('…', '')} value={v}
          onChange={e => set(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(); }} />
        <Btn onClick={go}>{label}</Btn>
      </div>
    );
  }

  // THE SHELL: the library shell's head and body, titled (paint `shell`)
  function Shell({ title, sub, back, onBack, shellRef, children, wipe }) {
    return (
      <div className="hp-sheet nl-scr nl" data-npc-shell="1" data-npc-zone="shell" data-doc-ground="creator" data-camp-screen={title} ref={shellRef}
        style={{ position: 'absolute', inset: 0, zIndex: 20, animation: wipe || undefined }}>
        <div className="nl-head">
          <button type="button" className="nl-back" aria-label={'Back to ' + back} onClick={onBack}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><polyline points="13,4 7,10 13,16" /></svg>{back}
          </button>
          <div className="nl-title"><b>{title}</b>{sub ? <span>{sub}</span> : null}</div>
          <span />
        </div>
        <div className="nl-body"><div data-camp={title}>{children}</div></div>
      </div>
    );
  }
  // encounters.css's EncSheet idiom, the same markup, portalled into the shell under its head
  function Sheet({ shellRef, title, onClose, children, foot, testid }) {
    const [top, setTop] = useState(0);
    const held = useRef(null);
    const sh = shellRef.current;
    React.useLayoutEffect(() => {
      const hd = sh && sh.querySelector(':scope > .nl-head');
      setTop(hd ? Math.max(0, hd.getBoundingClientRect().bottom - sh.getBoundingClientRect().top) : 0);
    }, [sh]);
    const U = window.SWRPGUI || {};
    if (U.useHoldFocus) U.useHoldFocus(held, true);
    if (U.useEscape) U.useEscape(!!onClose, () => { if (onClose) onClose(); });
    if (!sh || !ReactDOM.createPortal) return null;
    return ReactDOM.createPortal(
      <div className="enc-scrim" style={{ top: top + 'px' }} data-enc-sheet={testid || 'camp'}
        onClick={e => { if (e.target === e.currentTarget && onClose) onClose(); }}>
        <div className="enc-sheet" role="dialog" aria-modal="true" aria-label={title} ref={held}>
          <div className="enc-sh"><h2>{title}</h2>{onClose ? <button type="button" className="nl-glyph" aria-label="Close" onClick={onClose}>×</button> : null}</div>
          <div className="enc-sb">{children}</div>
          {foot ? <div className="enc-sf">{foot}</div> : null}
        </div>
      </div>, sh);
  }

  // a rejoin happens only when a CAMPAIGNS screen mounts with saved keys (F11; tableSession `rejoin`)
  function useRejoin() {
    useEffect(() => { const T = TS(); if (T && !T.state().role && T.savedRole()) T.rejoin(); }, []);
  }

  // ════ GM ════════════════════════════════════════════════════════════════════════════════════════════════════════
  function hereCount(s, id) {
    if (s.role !== 'gm' || s.campaignId !== id || s.phase === 'lost') return 0;
    return Object.keys(s.seats || {}).filter(k => s.seats[k].presence === 'here').length;
  }
  function tableOpen(s, id) { return s.role === 'gm' && s.campaignId === id && (s.phase === 'open' || s.phase === 'lost'); }
  function lastSession(c) { const l = (c.log || []).filter(e => e.kind === 'session'); return l.length ? dateOf(l[l.length - 1].at) : ''; }

  // G2 · CAMPAIGNS (the list, in EncList's markup)
  function GmList({ props, s, tick }) {
    const Cs = C(), list = Cs ? Cs.load().campaigns.filter(c => c && c.role === 'gm') : [];
    return (
      <Shell title="CAMPAIGNS" sub="TABLE" back="GM HOLOCRON" onBack={props.onBack} shellRef={props.shellRef} wipe={props.wipe}>
        <NewRow ph="New campaign name…" label="+ NEW CAMPAIGN" onAdd={n => { Cs.createCampaign('gm', n); tick(); }} />
        {!list.length ? <Empty /> : (
          <div className="hp-plate" data-pad="snug"><div className="nl-glist hp-bands">
            {list.map(c => {
              const open = tableOpen(s, c.id), last = lastSession(c);
              return (
                <div className="nl-grow" data-camp-row={c.id} key={c.id}>
                  <div className="nl-gn enc-gn"><b>{c.name}</b>
                    <span>{['CAST ' + c.cast.length, last ? 'SESSION ' + last : null].filter(Boolean).join(' · ')}</span>
                    {open ? <span className="enc-state" data-s="running">{'TABLE · ' + hereCount(s, c.id) + ' JOINED'}</span> : null}</div>
                  <div className="nl-mstrip">{members(c).map(m => <Chip key={m.who} name={memberName(m)} />)}</div>
                  <div className="nl-gacts" style={!open && TS().memOf(c.id) ? { display: 'flex', gap: 8 } : undefined}>{!open && TS().memOf(c.id) ? <Btn cls="hp-commit" aria-label={'Open table · ' + c.name} onClick={() => oneTap(props, c)}>OPEN TABLE</Btn> : null}
                    <Btn onClick={() => props.go({ id: c.id })}>OPEN</Btn></div>
                </div>
              );
            })}
          </div></div>
        )}
      </Shell>
    );
  }
  // T2 S3: the one-tap OPEN TABLE (a landing's line, a row's): opens the table with the name at the table, to G4's sheet
  function oneTap(props, c) { const T = TS(); if (T.label()) T.open(c.id, T.label(), true); T.lineTap = c.id; props.go({ id: c.id }); }

  // G3 · one campaign
  function GmCampaign({ props, s, tick, c }) {
    const w = useWide(), Cs = C();
    useEffect(() => { if (props.loadCrits) props.loadCrits().then(() => tick()); }, []);
    const [sheet, setSheet] = useState(() => { const T = TS(), on = T.lineTap === c.id; T.lineTap = null; return on; });   // T2: a one-tap open lands on G4
    const [renaming, setRenaming] = useState(null);
    const [entry, setEntry] = useState(null);   // D3: the NEW SESSION entry being typed
    const [pick, setPick] = useState(null);     // D7 'line' · D8 'cast' · D9 'pc': the sheet open over G3
    useEffect(() => { if (props.loadCast) props.loadCast().then(() => tick()); }, []);
    const open = tableOpen(s, c.id), lost = open && s.phase === 'lost';
    const seatOf = who => { const k = Object.keys(s.seats || {}).filter(id => s.seats[id].who === who)[0]; return k ? s.seats[k] : null; };
    const tableBtn = open ? <Btn cls="hp-commit" data-camp-table="open" onClick={() => setSheet(true)}>{'TABLE · ' + hereCount(s, c.id) + ' JOINED'}</Btn>
      : <Btn cls="hp-commit" data-camp-table="closed" onClick={() => setSheet(true)}>OPEN TABLE</Btn>;
    const rename = v => { const n = String(v || '').trim(); if (n && n !== c.name) { Cs.apply(st => Cs.setName(st, c.id, n)); tick(); } setRenaming(null); };
    const head = (
      <div className="nl-bar enc-bar" style={{ flexWrap: 'wrap', gap: '8px 12px' }}>
        <div className="enc-tb">
          {renaming != null
            ? <input type="text" className="nl-in" aria-label="Campaign name" autoFocus value={renaming} onChange={e => setRenaming(e.target.value)}
                onBlur={() => rename(renaming)} onKeyDown={e => { if (e.key === 'Enter') rename(renaming); if (e.key === 'Escape') setRenaming(null); }} />
            : <h2 className="nl-gname" data-npc-rename="1" onClick={() => setRenaming(c.name)}>{c.name}</h2>}
          <span className="enc-state">{frameName(c.frame)}</span>
        </div>
        <Btn aria-label="Change the game line" onClick={() => setPick('line')}>CHANGE</Btn>
        <span style={{ flex: 1 }} />{tableBtn}
      </div>
    );
    const party = (
      <section>
        <Sechead t="PARTY" />
        {members(c).map(m => {
          const seat = open ? seatOf(m.who) : null, pc = TS().pcOf(m.who);   // §4's one reader (B-1851): the record, else the seat's summary
          const live = !open ? undefined : !seat ? null : lost ? 'lost' : seat.presence === 'here';
          return (
            <div className="enc-row" key={m.who}>
              {live === undefined ? null : live === null ? <span aria-hidden="true" style={{ width: 18, flex: 'none' }} /> : <Dot on={live === true} />}
              <span className="enc-rn">{memberName(m)}<small>{pc.line || 'PC'}</small></span>
              {live === false ? <span className="enc-tag">dropped</span> : null}
            </div>
          );
        })}
        <div style={{ padding: '8px 0 0' }}><Btn onClick={() => setPick('pc')}>+ ADD PLAYER CHARACTER</Btn></div>
      </section>
    );
    const cast = (
      <section>
        <Sechead t="CAST" right={<Btn style={{ order: 3 }} onClick={() => setPick('cast')}>+ ADD</Btn>} />
        {c.cast.map(k => [k, props.npcOf ? props.npcOf(k) : null]).filter(([, n]) => n).map(([k, n]) => (
          <div className="enc-row" key={k}><Mono name={n.name} /><span className="enc-rn">{n.name}<small>{n.tier}</small></span></div>
        ))}
      </section>
    );
    // M5 (T2): SESSIONS above LOG; a SESSION line naming a session sits under it, the rest stay in LOG
    const sess = TS().doorOn() ? (c.sessions || []) : [], held = {};
    sess.forEach(x => { held[x.id] = x; });
    const lineOf = e => <LogEntry key={e.id} e={e} c={c} s={s} props={props} tick={tick} closed={!!(held[e.session] && held[e.session].closedAt != null)} />;
    const log = (
      <div>
        {sess.length ? <Sessions c={c} sess={sess} lineOf={lineOf} props={props} tick={tick} /> : null}
        <section data-camp-log="1">
          <Sechead t="LOG" right={<Btn style={{ order: 3 }} onClick={() => setEntry({ xp: '', triggered: [], track: 'OBLIGATION', who: (members(c)[0] || {}).who || '' })}>NEW SESSION</Btn>} />
          {entry ? <NewSession c={c} entry={entry} setEntry={setEntry} tick={tick} session={tableOpen(s, c.id) ? s.session : null} /> : null}
          {logRows(c.log).filter(e => !(e.kind === 'session' && held[e.session])).map(lineOf)}
        </section>
      </div>
    );
    return (
      <Shell title="CAMPAIGNS" sub="TABLE" back="CAMPAIGNS" onBack={() => props.go({})} shellRef={props.shellRef} wipe={props.wipe}>
        <div className="nl-board" style={{ display: 'block' }}>
          {head}
          {w >= 1440
            ? <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.25fr)', gap: '0 32px', alignItems: 'start' }}><div>{party}{cast}</div>{log}</div>
            : <div style={{ maxWidth: 920 }}>{party}{cast}{log}</div>}
        </div>
        {sheet ? <OpenTable props={props} s={s} c={c} onClose={() => setSheet(false)} /> : null}
        {pick === 'line' ? <LinePick props={props} c={c} tick={tick} onClose={() => setPick(null)} /> : null}
        {pick === 'cast' ? <CastAdd props={props} c={c} tick={tick} onClose={() => setPick(null)} /> : null}
        {pick === 'pc' ? <PcAdd props={props} c={c} tick={tick} onClose={() => setPick(null)} /> : null}
      </Shell>
    );
  }

  // M5 · each night a row: its date, who came, OPEN or CLOSED, DELETE (asking once, B-1794's alert), its lines under it
  function Sessions({ c, sess, lineOf, props, tick }) {
    const [del, setDel] = useState(null), lines = {};
    (c.log || []).forEach(e => { if (e.kind === 'session' && e.session) (lines[e.session] = lines[e.session] || []).push(e); });
    const target = del && sess.filter(x => x.id === del)[0];
    return (
      <section data-t2-sessions="1">
        <Sechead t="SESSIONS" />
        {sess.slice().sort((a, b) => b.openedAt - a.openedAt).map(x => (
          <div key={x.id} className="enc-row" data-camp-sess={x.id} style={{ flexWrap: 'wrap', alignItems: 'flex-start', padding: '10px 0' }}>
            <span className="enc-rn" style={{ flex: '1 1 220px' }}>{dateOf(x.openedAt)}<small>{x.came.length ? x.came.map(y => y.label).join(' · ') : 'No one came'}</small></span>
            <span className="enc-tag" style={{ alignSelf: 'center' }}>{x.closedAt != null ? 'CLOSED' : 'OPEN'}</span>
            <Btn aria-label={'Delete the session of ' + dateOf(x.openedAt)} onClick={() => setDel(x.id)}>DELETE</Btn>
            <div style={{ flexBasis: '100%', borderLeft: '2px solid var(--doc-rule,rgba(23,22,27,.28))', paddingLeft: 12, marginTop: 4 }}>
              {(lines[x.id] || []).length ? lines[x.id].slice().reverse().map(lineOf)
                : <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: MUTED, padding: '6px 0' }}>{x.closedAt != null ? 'No SESSION line' : 'No SESSION line yet'}</div>}
            </div>
          </div>
        ))}
        {target ? <Sheet shellRef={props.shellRef} title={'DELETE ' + dateOf(target.openedAt) + '?'} testid="camp-sess-del"
          foot={[<Btn key="d" cls="hp-commit" onClick={() => { TS().deleteSession(c.id, target.id); setDel(null); tick(); }}>DELETE</Btn>,
            <span key="f" style={{ flex: 1 }} />, <Btn key="c" onClick={() => setDel(null)}>CANCEL</Btn>]}>
          <p className="enc-read" style={{ boxShadow: 'none', padding: 0 }}>{(lines[target.id] || []).length ? 'This session is deleted. Its SESSION line stays in LOG.' : 'This session is deleted.'}</p>
        </Sheet> : null}
      </section>
    );
  }

  // D7 · G3's CHANGE (D-543): the three game lines as pick rows, the current one ✓; a pick sets the record's frame.book
  function LinePick({ props, c, tick, onClose }) {
    const Cs = C(), cur = c.frame && c.frame.book;
    const choose = id => { if (id !== cur) Cs.apply(st => Cs.setFrame(st, c.id, Object.assign({}, c.frame || {}, { book: id }))); tick(); onClose(); };
    return <Sheet shellRef={props.shellRef} title="GAME LINE" testid="camp-line" onClose={onClose}>
      {Object.keys(BOOK_NAMES).map(id => <Pick key={id} on={id === cur} label={BOOK_NAMES[id]} onClick={() => choose(id)} />)}</Sheet>;
  }
  // D8 · CAST + ADD (D-543; ruled (a) @ ef9ed5441): the add-NPC search's input and result rows (BenchAddMemberBlock's
  // markup), a plain name filter over the library's pool (props.npcSearch); a pick adds the key to the record's cast
  function CastAdd({ props, c, tick, onClose }) {
    const Cs = C(), [q, setQ] = useState('');
    const hits = q.trim() && props.npcSearch ? props.npcSearch(q.trim()) : [];
    const add = k => { Cs.apply(st => Cs.addCast(st, c.id, k)); tick(); onClose(); };
    return <Sheet shellRef={props.shellRef} title="ADD TO THE CAST" testid="camp-cast" onClose={onClose}>
      <input type="text" className="nl-in" autoFocus value={q} placeholder="Add an NPC — search by name…" aria-label="Add an NPC" style={{ width: '100%' }}
        onChange={e => setQ(e.target.value)} />
      {hits.length ? <div className="hp-plate" data-pad="data" style={{ marginTop: 10 }}><div className="hp-index hp-bands">
        {hits.map(n => <button key={n.key} type="button" className="hp-row" onClick={() => add(n.key)}>
          <span className="hp-row-body"><span className="hp-row-desig">{n.name}</span><span className="nl-tier">{n.tier}</span></span></button>)}
      </div></div> : null}
    </Sheet>;
  }
  // D9 · + ADD PLAYER CHARACTER (D-543): EncAddPc's look — ON THIS DEVICE (+ ADD / ADDED), then BY NAME…; writes the
  // campaign's party through its one edit (SWRPGCampaigns.editParty)
  function PcAdd({ props, c, tick, onClose }) {
    const Cs = C(), Pp = P(), [byName, setByName] = useState(null);
    const has = who => members(c).some(m => m.who === who);
    const add = (fn) => { Cs.editParty(c.id, fn); tick(); };
    const addChar = r => add((ps, pid) => Pp.addCharMember(ps, r.id, r.name || '', pid));
    const addName = () => { const n = (byName || '').trim(); if (!n) return; add((ps, pid) => Pp.addNameMember(ps, n, [], [], pid)); setByName(null); };
    return <Sheet shellRef={props.shellRef} title="ADD PLAYER CHARACTER" testid="camp-pc" onClose={onClose}>
      <div className="enc-sub" style={{ marginTop: 0 }}>ON THIS DEVICE</div>
      {chars().filter(r => r && r.id != null).map(r => <div key={r.id} className="enc-row"><span className="enc-rn">{r.name || 'Unnamed'}<small>{charLine(r)}</small></span>
        {has('char:' + r.id) ? <span className="enc-tag">ADDED</span> : <Btn aria-label={'Add ' + (r.name || 'Unnamed')} onClick={() => addChar(r)}>+ ADD</Btn>}</div>)}
      <div className="enc-row" style={{ borderBottom: 0 }}>
        {byName == null ? <Btn cls="hp-quiet nl-dashed" style={{ width: '100%' }} onClick={() => setByName('')}>BY NAME…</Btn> : (
          <React.Fragment>
            <input className="nl-in" autoFocus value={byName} aria-label="A player character by name" style={{ flex: 1 }}
              onChange={e => setByName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addName(); }} />
            <Btn disabled={!byName.trim()} onClick={addName}>+ ADD</Btn>
          </React.Fragment>)}
      </div>
    </Sheet>;
  }

  // the LOG as read: newest first; a fight's `encounter` entries (D2 logs one per tap) read as ONE row — its latest
  // rounds, every item in the order logged, dated by its first entry. xp_sent entries are read by their SESSION line.
  function logRows(log) {
    const out = [], fights = {};
    (log || []).forEach(e => {
      if (e.kind === 'session') out.push(e);
      else if (e.kind === 'encounter') {
        const k = e.groupId || e.id;
        if (!fights[k]) { fights[k] = Object.assign({}, e, { items: (e.items || []).slice() }); out.push(fights[k]); }
        else { fights[k].rounds = e.rounds; fights[k].items = fights[k].items.concat(e.items || []); }
      }
    });
    return out.reverse();
  }
  // B-1884 (ruling `encounters-e6-walk` ADDENDUM 16, L-1): an item is named by the live member, then the device's record
  // (pcOf, B-1851's one reader), then the name kept at + ADD (a departed member's memory), then the id
  function triggeredLine(e, c) {
    return (e.triggered || []).map(t => {
      const m = members(c).filter(x => x.who === t.who)[0], pc = !m && TS() ? TS().pcOf(t.who) : null;
      const nm = m ? memberName(m) : (pc && pc.name) || (typeof t.name === 'string' && t.name.trim()) || String(t.who || '').replace(/^(char|name):/, '');
      return String(t.track || '').toUpperCase() + ' · ' + nm.toUpperCase();
    }).join(' · ');
  }
  // a LOG entry: an encounter's END lines, or a SESSION line with G5's SEND XP
  function LogEntry({ e, c, s, props, tick, closed }) {
    const Cs = C();
    const [xp, setXp] = useState(e.xp != null ? String(e.xp) : '');
    if (e.kind === 'session') {
      const sent = Cs.xpSentOf(Cs.load(), c.id, e.id), trig = triggeredLine(e, c);
      const lines = sent && !closed && s.role === 'gm' && s.campaignId === c.id ? TS().xpLines(sent.offerId) : [];   // L-2 (B-1886); R-T2TM-1: a closed night's line alone
      const n = parseInt(xp, 10);
      return (
        <div className="enc-row" data-camp-session={e.id} style={{ flexWrap: 'wrap', alignItems: 'flex-start', padding: '10px 0' }}>
          <span className="enc-rn" style={{ flex: '1 1 220px' }}>SESSION<small>{dateOf(e.at) + (trig ? ' · ' + trig : '')}</small></span>
          {sent ? null : (
            <label style={Object.assign({ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: MUTED }, MONO)}>XP
              <input type="number" className="nl-in" value={xp} inputMode="numeric" aria-label="XP to send" style={{ width: 88, textAlign: 'right' }}
                onChange={ev => setXp(ev.target.value)} /></label>
          )}
          {sent ? <span className="enc-tag" style={{ alignSelf: 'center' }}>{sent.amount + ' XP SENT'}</span>
            : <Btn cls="hp-commit" data-camp-sendxp="1" disabled={!(n >= 1 && n <= Cs.XP_MAX)}
                onClick={() => { TS().sendXp(c.id, e.id, n); tick(); }}>SEND XP</Btn>}
          {lines.length ? (
            <div style={{ flexBasis: '100%', display: 'grid', gap: 4, padding: '6px 0 0' }}>
              {lines.map(({ k, name: nm, took: a }) => {
                return <div key={k} style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: a === true ? 'var(--doc-ink,#17161B)' : MUTED }}>
                  {a === true ? nm + ' added ' + sent.amount + ' XP' : nm + ' · ' + (a === false ? 'dismissed' : 'waiting')}</div>;
              })}
            </div>
          ) : null}
        </div>
      );
    }
    return (
      <div className="enc-row" data-camp-encounter={e.id} style={{ flexWrap: 'wrap', alignItems: 'flex-start', padding: '10px 0' }}>
        <span className="enc-rn" style={{ flex: '1 1 100%' }}>{(props.encounterName && props.encounterName(e.groupId)) || 'Encounter'}
          <small>{dateOf(e.at) + ' · ' + (e.rounds || 0) + ' ROUNDS'}</small></span>
        <div className="nl-mstrip" style={{ flexBasis: '100%', flexWrap: 'wrap' }}>
          {(e.items || []).map((it, i) => it.type === 'crit'
            ? <span key={i} className="enc-chip" style={{ margin: 0 }}><b>{String(it.roll != null ? it.roll : '')}</b>{'· ' + (it.text || (props.critName && props.critName(it.roll)) || '') + ' · ' + (it.label || '')}</span>
            : <Chip key={i} name={it.label || ''} val={it.type === 'fell' ? 'fell' : it.type === 'craft' ? 'hull ' + (it.hull || 0) : it.condition || it.text || null} />)}
        </div>
      </div>
    );
  }
  // D3 · a new SESSION line, typed by the GM (D-540): date (today), XP, the triggers; LOG SESSION appends it
  function NewSession({ c, entry, setEntry, tick, session }) {
    const Cs = C(), ms = members(c);
    const up = patch => setEntry(Object.assign({}, entry, patch));
    const log = () => {
      const n = parseInt(entry.xp, 10), rec = { kind: 'session', triggered: entry.triggered };
      if (TS().doorOn()) rec.session = session || null;   // T2 §3: the session it was written in
      if (n >= 1) rec.xp = n;
      Cs.apply(st => Cs.appendLog(st, c.id, rec));
      setEntry(null); tick();
    };
    return (
      <div className="enc-row" data-camp-newsession="1" style={{ flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', padding: '10px 0' }}>
        <span className="enc-rn" style={{ flex: '1 1 160px' }}>SESSION<small>{dateOf(now())}</small></span>
        <label style={Object.assign({ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: MUTED }, MONO)}>XP
          <input type="number" className="nl-in" value={entry.xp} inputMode="numeric" aria-label="XP given" style={{ width: 88, textAlign: 'right' }}
            onChange={e => up({ xp: e.target.value })} /></label>
        <div style={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {entry.triggered.map((t, i) => {
            const m = ms.filter(x => x.who === t.who)[0], nm = (m ? memberName(m) : '').toUpperCase(), k = t.track.toUpperCase();
            return <span key={i} className="enc-chip" style={{ margin: 0 }}><b>{k}</b>{'· ' + nm}
              <Btn cls="nl-glyph" aria-label={'Remove ' + k + ' ' + nm} onClick={() => up({ triggered: entry.triggered.filter((_, j) => j !== i) })}>×</Btn></span>;
          })}
          <select className="nl-sel" aria-label="Which came up" value={entry.track} onChange={e => up({ track: e.target.value })}>
            {TRACKS.map(t => <option key={t}>{t.toUpperCase()}</option>)}</select>
          <select className="nl-sel" aria-label="Whose" value={entry.who} onChange={e => up({ who: e.target.value })}>
            {ms.map(m => <option key={m.who} value={m.who}>{memberName(m)}</option>)}</select>
          <Btn onClick={() => { if (!entry.who) return; const t = { track: entry.track.toLowerCase(), who: entry.who };
            const pick = ms.filter(x => x.who === entry.who)[0], nm = pick ? keptName(pick) : '';   // L-1: the name as picked, if it has one
            if (nm) t.name = nm;
            if (!entry.triggered.some(x => x.track === t.track && x.who === t.who)) up({ triggered: entry.triggered.concat([t]) }); }}>+ ADD</Btn>
        </div>
        <div style={{ flexBasis: '100%', display: 'flex', gap: 8 }}>
          <Btn cls="hp-commit" onClick={log}>LOG SESSION</Btn><Btn onClick={() => setEntry(null)}>CANCEL</Btn>
        </div>
      </div>
    );
  }

  // G4 · the OPEN TABLE sheet
  function OpenTable({ props, s, c, onClose }) {
    const T = TS(), small = window.innerWidth < 600;
    const [, setClock] = useState(0);
    const [ask, setAsk] = useState(null);   // M3: FORGET asks once, in its row
    const [noNet, setNoNet] = useState(false);
    const mine = s.role === 'gm' && s.campaignId === c.id;
    // D11 (D-543): another campaign's table is open — refused, naming it; nothing is sent and nothing is written
    const other = !mine && T.otherTable(c.id) ? C().campaignOf(C().load(), s.campaignId) : null;
    // D10 (D-543): a closed table first asks the GM's name at the table, prefilled from swrpg_table_label; OPEN sends it
    const [nm, setNm] = useState(() => T.label());
    const closed = !mine || s.phase === 'idle' || s.phase === 'ended';
    useEffect(() => { if (closed && !other && !online() && !T.atOrigin()) setNoNet(true); }, []);   // the program's table needs no internet (§4.4)
    useEffect(() => { const t = setInterval(() => setClock(n => n + 1), 1000); return () => clearInterval(t); }, []);
    const kids = [];
    const codeBig = { fontFamily: 'var(--font-display,var(--font-mono))', fontSize: small ? 40 : 52, letterSpacing: '.12em', lineHeight: 1, color: 'var(--doc-ink,#17161B)' };
    const qrW = small ? 132 : 168;
    const phase = noNet ? 'noNet' : !mine ? 'opening' : s.phase;
    let foot = [<span key="f" style={{ flex: 1 }} />, <Btn key="c" onClick={() => { T.close(); onClose(); }}>CLOSE TABLE</Btn>];
    if (other || T.otherTable(c.id)) {
      return <Sheet shellRef={props.shellRef} title="OPEN TABLE" testid="camp-open" onClose={onClose}>
        <p style={ALERT} role="alert">{'Your table for ' + ((other && other.name) || 'another campaign') + ' is open — close it first'}</p></Sheet>;
    }
    if (closed && phase !== 'noNet') {
      const go = () => { const n = nm.trim(); if (n) T.open(c.id, n, true); };
      return <Sheet shellRef={props.shellRef} title="OPEN TABLE" testid="camp-open" onClose={onClose}
        foot={[<span key="f" style={{ flex: 1 }} />, <Btn key="o" cls="hp-commit" disabled={!nm.trim()} onClick={go}>OPEN</Btn>]}>
        {/* D12 (ruling `encounters-e6-walk` §5, D-576 b5): no code marks and no QR box before OPEN; G4 `opening` draws them */}
        <label style={{ display: 'block', margin: 0 }}><span className="enc-tag" style={{ display: 'block', margin: '0 0 6px' }}>Your name at the table</span>
          <input type="text" className="nl-in" value={nm} maxLength={T.LABEL_MAX} onChange={e => setNm(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(); }}
            style={{ width: '100%', maxWidth: 420 }} /></label>
      </Sheet>;
    }
    if (phase === 'noNet' || phase === 'unreachable') {
      kids.push(<p key="a" style={ALERT} role="alert">{phase === 'unreachable' ? CANT_REACH : 'Opening a table needs internet'}</p>);
      foot = null;
    } else if (phase === 'opening' || phase === 'idle') {
      kids.push(<div key="o" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={Object.assign({}, codeBig, { color: MUTED })} aria-label="Opening">___-___</div>
        <div style={{ width: qrW, aspectRatio: '1', border: '1px dashed var(--doc-rule,rgba(23,22,27,.28))', flex: 'none' }} /></div>);
      kids.push(<p key="t" className="enc-tag" style={{ margin: '12px 0 0' }}>OPENING</p>);
    } else {
      const seatIds = Object.keys(s.seats || {}), atTable = seatIds.length > 0, lost = phase === 'lost';
      const expired = typeof s.codeExpiresAt === 'number' && now() >= s.codeExpiresAt;
      if (lost) kids.push(<div key="l" className="enc-row" role="alert" data-camp-online="gmLost"><Dot on={false} />
        <span className="enc-rn" style={{ color: 'var(--doc-critical,#7F2A14)' }}>Lost the table</span><Btn cls="hp-commit" onClick={() => T.rejoin()}>RECONNECT</Btn></div>);
      // A4-C2/C7.3: the address is the session's (holocron.work's JOIN unless '@origin'); in the program '' draws §4.4's
      // no-address box and null (the address unread) G4's empty box, and a QR comes with the line `Or open … on this Wi-Fi.`
      const ju = T.joinUrl(showCode(s.code)), qr = ju && qrSvg(ju), box = { width: qrW, aspectRatio: '1', border: '1px dashed var(--doc-rule,rgba(23,22,27,.28))', flex: 'none' };
      kids.push(<div key="c" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', marginTop: lost ? 14 : 0 }}>
        <div>
          <div style={Object.assign({}, codeBig, expired ? { color: MUTED, textDecoration: 'line-through' } : {})} data-camp-code="1">{showCode(s.code)}</div>
          {expired && atTable ? [<p key="e" className="enc-tag" style={{ margin: '12px 0 0' }} data-camp-online="expired">Code expired</p>,
            <div key="n" style={{ padding: '12px 0 0' }}><Btn cls="hp-commit" onClick={() => T.newcode()}>NEW CODE</Btn></div>]
            : expired ? <div style={{ padding: '12px 0 0' }}><Btn cls="hp-commit" onClick={() => T.newcode()}>OPEN AGAIN</Btn></div>
            : <p className="enc-tag" style={{ margin: '12px 0 0' }}>Code works for 15 min</p>}
        </div>
        {expired ? null : qr ? <div aria-label="QR code for the join link" role="img" data-camp-qr="1"
          style={{ width: qrW, flex: 'none', background: '#fff', border: '1px solid var(--doc-rule,rgba(23,22,27,.28))' }} dangerouslySetInnerHTML={{ __html: qr }} />
          : ju === '' ? <p data-camp-online="noAddr" style={Object.assign(box, { width: 220, aspectRatio: 'auto', minHeight: qrW, margin: 0, padding: '0 14px', display: 'flex', alignItems: 'center', fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.45, color: 'var(--doc-ink,#17161B)' })}>No Wi-Fi on this computer. Players can join once it's connected.</p>
          : <div style={box} />}
      </div>);
      if (qr && T.atOrigin()) kids.push(<p key="u" data-camp-online="lanLine" style={{ margin: '14px 0 0', fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--doc-ink,#17161B)' }}>
        {'Or open '}<span style={{ fontFamily: 'var(--font-mono)' }}>{ju.replace(/^https?:\/\//, '').replace(/#.*$/, '')}</span>{' on this '}<span style={{ whiteSpace: 'nowrap' }}>Wi-Fi.</span></p>);
      kids.push(<div key="w" className="enc-row" style={{ marginTop: 14 }}><span className="enc-rn">ON THIS WI-FI</span>
        <button type="button" role="switch" aria-checked={s.listed ? 'true' : 'false'} aria-label="On this Wi-Fi" className="hp-quiet" style={{ minWidth: 64 }}
          onClick={() => T.setListed(!s.listed)}>
          <span aria-hidden="true" style={{ display: 'inline-block', width: 34, height: 18, borderRadius: 9, background: s.listed ? 'var(--doc-action,#7E1414)' : MUTED, position: 'relative', verticalAlign: 'middle' }}>
            <i style={Object.assign({ position: 'absolute', top: 2, width: 14, height: 14, borderRadius: '50%', background: 'var(--doc-paper-raised,#F2F1EC)' }, s.listed ? { right: 2 } : { left: 2 })} /></span>
        </button></div>);
      const knocks = (s.knocks || []).length ? [<Sechead key="kh" t="KNOCKS" />, ...s.knocks.map(k => (
        <div key={'k' + k.knockId} className="enc-row"><span className="enc-rn"><b>{k.deviceLabel}</b> wants to join</span>
          <Btn cls="hp-commit" onClick={() => T.admit(k.knockId)}>LET IN</Btn><Btn onClick={() => T.refuse(k.knockId)}>NO</Btn></div>))] : [];
      // M3 (T2): a remembered seat carries FORGET; one not seated tonight reads `not yet`
      const mem = {}; T.remembered(c.id).forEach(x => { mem[x.knockId] = x.label; });
      const notYet = Object.keys(mem).filter(k => !s.seats[k]);
      const forget = (k, nm) => mem[k] != null ? <Btn aria-label={'Forget ' + nm} onClick={() => setAsk(k)}>FORGET</Btn> : null;
      const row = (k, nm, inner) => <div key={'s' + k} className="enc-row" {...inner.attrs}>{inner.body}{forget(k, nm)}</div>;
      // FORGET asks once, under the sheet's head, every row kept below it (as drawn; encounters-t2-build ADDENDUM 4)
      const askName = ask && (s.seats[ask] ? ((s.seats[ask].summary && s.seats[ask].summary.name) || s.seats[ask].deviceLabel) : mem[ask]);
      const askRow = ask && askName != null ? <div key="ask" className="enc-row" role="alertdialog" style={{ flexWrap: 'wrap' }}><span className="enc-rn" style={{ flex: '1 1 220px' }}>{'Forget ' + askName + '? They knock next time.'}</span>
        <Btn cls="hp-commit" onClick={() => { T.forget(ask); setAsk(null); }}>FORGET</Btn><Btn onClick={() => setAsk(null)}>KEEP</Btn></div> : null;
      const rows = atTable || notYet.length ? [<Sechead key="ah" t="AT THE TABLE" />, ...seatIds.map(k => {
        const st = s.seats[k], nm = (st.summary && st.summary.name) || st.deviceLabel;
        if (st.presence !== 'here' && !lost) return row(k, nm, { body: [<Dot key="d" on={false} />, <span key="n" className="enc-rn" style={{ color: MUTED }}>{nm + ' dropped'}</span>] });
        if (!st.who) return row(k, st.deviceLabel, { attrs: { 'data-camp-nochar': '1' }, body: [<Dot key="d" on={!lost} />,   /* R-E6J-1 */
          <span key="n" className="enc-rn">{st.deviceLabel}<span style={{ color: MUTED }}> · no character yet</span></span>] });
        return row(k, nm, { body: [<Dot key="d" on={!lost} />, <span key="n" className="enc-rn">{nm}</span>] });
      }), ...notYet.map(k => row(k, mem[k], { body: [<Dot key="d" on={false} />, <span key="n" className="enc-rn">{mem[k]}<span style={{ color: MUTED }}> · not yet</span></span>] }))] : [];
      // D-T2M5 (b): a night with remembered players reads AT THE TABLE, KNOCKS, then FOR NEWCOMERS; a first-time open keeps G4's order
      if (s.oneTap) { const head = kids.splice(lost ? 1 : 0); kids.push(...rows, ...knocks, <Sechead key="nh" t="FOR NEWCOMERS" />, ...head); }
      else kids.push(...knocks, ...rows);
      if (askRow) kids.unshift(askRow);
      if (expired && !atTable) foot = null;
    }
    return <Sheet shellRef={props.shellRef} title="OPEN TABLE" onClose={onClose} foot={foot} testid="camp-open">{kids}</Sheet>;
  }

  // ════ PLAYER ════════════════════════════════════════════════════════════════════════════════════════════════════
  function seatedAt(s, id) { return s.role === 'player' && s.campaignId === id && (s.phase === 'admitted' || s.phase === 'lost'); }

  // P2 · CAMPAIGNS
  function PlList({ props, tick }) {
    const Cs = C(), list = Cs ? Cs.load().campaigns.filter(c => c && c.role === 'player') : [];
    return (
      <Shell title="CAMPAIGNS" sub="TABLE" back="BACK" onBack={props.onBack} shellRef={props.shellRef} wipe={props.wipe}>
        <div style={{ display: 'flex', gap: 8, margin: '0 0 14px', flexWrap: 'wrap' }}>
          <Btn cls="hp-commit" onClick={() => props.go({ join: '' })}>JOIN TABLE</Btn>
          <NewRow ph="New campaign name…" label="+ NEW CAMPAIGN" style={{ flex: '1 1 320px', margin: 0 }} onAdd={n => { Cs.createCampaign('player', n); tick(); }} />
        </div>
        {!list.length ? <Empty /> : (
          <div className="hp-plate" data-pad="snug"><div className="nl-glist hp-bands">
            {list.map(c => {
              const mine = c.characterIds.map(id => (charRec(id) || {}).name).filter(Boolean);
              return (
                <div className="nl-grow" data-camp-row={c.id} key={c.id}>
                  <div className="nl-gn enc-gn"><b>{c.name}</b>
                    <span>{[c.table && c.table.gmLabel ? 'with ' + c.table.gmLabel : null, mine.join(' · ')].filter(Boolean).join(' · ')}</span>
                    {c.inbox.length ? <span className="enc-state" data-s="running">{'INBOX ' + c.inbox.length}</span> : null}</div>
                  <div className="nl-mstrip">{members(c).map(m => <Chip key={m.who} name={memberName(m)} />)}</div>
                  <div className="nl-gacts" style={TS().memOf(c.id) ? { display: 'flex', gap: 8 } : undefined}>{TS().memOf(c.id) ? <Btn cls="hp-commit" aria-label={'Join · ' + c.name} onClick={() => { TS().joinRemembered(c.id); props.go({ id: c.id }); }}>JOIN</Btn> : null}
                    <Btn onClick={() => props.go({ id: c.id })}>OPEN</Btn></div>
                </div>
              );
            })}
          </div></div>
        )}
      </Shell>
    );
  }

  // P3 · JOIN TABLE (P4 is its sheet)
  function CodeBoxes({ code, setCode, onJoin, named }) {
    const refs = useRef([]), small = window.innerWidth < 600, ch = code.split('');
    const put = (i, v) => {
      const c = String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (c.length > 1) { const all = (code.slice(0, i) + c).slice(0, 6); setCode(all); const f = refs.current[Math.min(all.length, 5)]; if (f) f.focus(); return; }
      const next = (code.slice(0, i) + c + code.slice(i + 1)).slice(0, 6);
      setCode(next);
      if (c && refs.current[i + 1]) refs.current[i + 1].focus();
    };
    const box = i => <input key={i} ref={el => { refs.current[i] = el; }} type="text" className="nl-in" maxLength={6} value={ch[i] || ''} aria-label={'Code character ' + (i + 1)}
      onChange={e => put(i, e.target.value)} onKeyDown={e => { if (e.key === 'Backspace' && !ch[i] && i > 0) refs.current[i - 1].focus(); if (e.key === 'Enter') onJoin(); }}
      style={{ width: 44, padding: 0, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 20, textTransform: 'uppercase' }} />;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: small ? 4 : 6, flexWrap: 'wrap' }}>
        {box(0)}{box(1)}{box(2)}
        <span aria-hidden="true" style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: MUTED, padding: '0 2px' }}>-</span>
        {box(3)}{box(4)}{box(5)}
        <Btn cls="hp-commit" style={{ marginLeft: small ? 4 : 10 }} disabled={code.length !== 6 || !named} onClick={onJoin}>JOIN</Btn>
      </div>
    );
  }
  function PlJoin({ props, s, tick }) {
    const T = TS();
    const [code, setCode] = useState(() => String(props.route.join || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 6));
    const [name, setName] = useState(() => T.label());
    const [via, setVia] = useState(null);   // the listing's name when joined from TABLES ON THIS WI-FI
    const net = online();
    useEffect(() => { if (net) T.list(); }, []);
    const knocking = s.role === 'player' && s.phase === 'knocking';
    const admitted = s.role === 'player' && s.phase === 'admitted' && !s.campaignId;
    const join = where => { T.join(where, name); };
    const unreach = s.unreachable === 'list' || (s.role === 'player' && s.phase === 'unreachable');   // R-E6F-4, every phase
    const err = unreach ? CANT_REACH : s.role === 'player' && s.error && ERR[s.error] ? ERR[s.error] : null;
    const tables = s.tables || [];
    return (
      <Shell title="JOIN TABLE" back="CAMPAIGNS" onBack={() => props.go({})} shellRef={props.shellRef} wipe={props.wipe}>
        <div style={{ maxWidth: 760 }}>
          {!net ? <p style={ALERT} role="alert">Joining a table needs internet</p> : [
            knocking ? <div key="k" className="hp-plate" data-pad="read"><div className="enc-row" style={{ border: 0 }}><Dot on={false} />
              <span className="enc-rn">Waiting for the GM to let you in
                {s.joinCode != null ? <small style={{ fontFamily: 'var(--font-mono)', letterSpacing: '.12em' }}>{showCode(s.joinCode)}</small> : <small>{via || ''}</small>}</span></div></div> : null,
            <Sechead key="th" t="TABLES ON THIS WI-FI" />,
            s.tables && !tables.length && !unreach ? <p key="te" className="enc-read" style={{ boxShadow: 'none', padding: 0, margin: '4px 0 0' }}>No tables found on this Wi-Fi — type the code</p> : null,
            ...tables.map(t => <div key={t.tableId} className="enc-row"><span className="enc-rn">{t.label}</span>
              <Btn aria-label={'Join ' + t.label} disabled={!name.trim()} onClick={() => { setVia(t.label); join({ tableId: t.tableId }); }}>JOIN</Btn></div>),
            <Sechead key="ch" t="OR TYPE THE CODE" />,
            <CodeBoxes key="cb" code={code} setCode={setCode} named={!!name.trim()} onJoin={() => { if (code.length === 6) { setVia(null); join({ code: showCode(code) }); } }} />,
            err ? <p key="er" style={ALERT} role="alert">{err}</p> : null,
            <label key="nm" style={{ display: 'block', margin: '22px 0 0' }}>
              <span className="enc-tag" style={{ display: 'block', margin: '0 0 6px' }}>Your name at the table</span>
              <input type="text" className="nl-in" value={name} maxLength={T.LABEL_MAX} onChange={e => setName(e.target.value)} style={{ width: '100%', maxWidth: 420 }} />
            </label>,
          ]}
        </div>
        {admitted ? <PutItWhere props={props} s={s} tick={tick} /> : null}
      </Shell>
    );
  }

  // P4 · joined: put it where
  function PutItWhere({ props, s, tick }) {
    const Cs = C(), T = TS(), hello = s.hello || {};
    const mine = chars();
    // B-1854: unlinked campaigns, and the one linked to this table's GM campaign, pre-picked (last session's comes back)
    const kc = T.keepChoices(), camps = kc.camps;
    const [who, setWho] = useState(() => (mine[0] ? String(mine[0].id) : null));
    const [where, setWhere] = useState(() => kc.pick);   // a campaign id, or null = NEW CAMPAIGN
    useEffect(() => { if (kc.pick) setWhere(kc.pick); }, [kc.pick]);   // the hello can land after P4 opens
    const [nm, setNm] = useState(() => hello.name || '');
    useEffect(() => { if (!nm && hello.name) setNm(hello.name); }, [hello.name]);
    const done = () => {
      let id = where;
      if (!id) { const r = Cs.createCampaign('player', nm.trim() || hello.name || 'Campaign'); if (!r.ok) return; id = r.id; }
      T.seat(id, who);
      tick(); props.go({ id: id });
    };
    const kids = [<Sechead key="pa" t="Play as" />,
      mine.length ? mine.map(c => <Pick key={c.id} on={String(c.id) === who} label={c.name || 'Unnamed'} sub={charLine(c)} onClick={() => setWho(String(c.id))} />)
        : <div key="nc" className="enc-row" data-camp-nochar="1"><span className="enc-rn">No characters yet</span><Btn onClick={() => props.onMakeCharacter && props.onMakeCharacter()}>MAKE ONE</Btn></div>,
      <Sechead key="ki" t="Keep it in" />,
      ...camps.map(c => <Pick key={c.id} on={where === c.id} label={c.name} sub={members(c).map(memberName).join(' · ')} onClick={() => setWhere(c.id)} />),
      <div key="nw" className="enc-row" style={{ gap: 8 }}>
        <input type="text" className="nl-in" value={nm} aria-label="New campaign name" style={{ flex: 1, minWidth: 0 }} onChange={e => { setNm(e.target.value); setWhere(null); }} />
        <button type="button" className="hp-quiet" aria-pressed={where ? 'false' : 'true'} onClick={() => setWhere(null)}
          style={where ? undefined : { outline: '2px solid var(--doc-action,#7E1414)', outlineOffset: -2 }}>NEW CAMPAIGN</button>
      </div>];
    return <Sheet shellRef={props.shellRef} title={[hello.name, hello.gmLabel ? 'with ' + hello.gmLabel : null].filter(Boolean).join(' · ')} testid="camp-where"
      foot={[<span key="f" style={{ flex: 1 }} />, <Btn key="d" cls="hp-commit" onClick={done}>DONE</Btn>]}>{kids}</Sheet>;
  }

  // M4 (T2) · the player who tapped before the GM opened: waiting, the wait ended, turned away (D-T2M8: the live copy)
  function Wait({ s, c }) {
    const T = TS(), me = s.role === 'player' && s.campaignId === c.id;
    if (!me || !s.oneTap) return null;
    const gm = (T.memOf(c.id) || {}).gmLabel || (c.table && c.table.gmLabel) || 'the GM';
    if (s.phase === 'waiting') return <div className="enc-row" role="status" data-camp-wait="waiting"><Dot on={false} /><span className="enc-rn">{'Waiting for ' + gm + ' to open the table'}</span></div>;
    if (s.phase === 'waitEnded') return <div className="enc-row" role="status" data-camp-wait="ended"><Dot on={false} /><span className="enc-rn">{gm + " hasn't opened the table"}</span>
      <Btn cls="hp-commit" onClick={() => T.joinRemembered(c.id)}>WAIT AGAIN</Btn></div>;
    if (s.error === 'closed' && s.phase !== 'admitted') return <div className="enc-row" role="alert" data-camp-wait="closed"><Dot on={false} />
      <span className="enc-rn" style={{ color: 'var(--doc-critical,#7F2A14)' }}>{ERR.closed}</span></div>;
    return null;
  }

  // P5 · one campaign
  function PlCampaign({ props, s, tick, c }) {
    const Cs = C(), T = TS();
    const seated = seatedAt(s, c.id), linked = !!c.table && seated;
    const lost = seated && s.phase === 'lost', away = seated && !lost && s.gm === 'away';
    const myIds = c.characterIds.filter(id => charRec(id));
    const add = o => { const r = Cs.take(c.id, o.id, myIds[0]); if (r.ok) T.taken(o.id, true); tick(); };
    const drop = o => { Cs.apply(st => Cs.dismiss(st, c.id, o.id)); T.taken(o.id, false); tick(); };
    const book = frameName(c.frame);
    const head = (
      <div className="nl-bar enc-bar" style={{ flexWrap: 'wrap', gap: '8px 12px' }}>
        <div className="enc-tb"><h2 className="nl-gname">{c.name}</h2>
          {c.table && (linked || c.table.gmLabel) ? <span className="enc-state" style={{ display: 'flex', alignItems: 'center' }}>{linked ? <Dot on={!away && !lost} /> : null}{c.table.gmLabel ? 'with ' + c.table.gmLabel : null}</span> : null}</div>
        <span style={{ flex: 1 }} />{linked ? <Btn onClick={() => { T.leave(); tick(); }}>LEAVE TABLE</Btn> : null}
      </div>
    );
    return (
      <Shell title="CAMPAIGNS" sub="TABLE" back="CAMPAIGNS" onBack={() => props.go({})} shellRef={props.shellRef} wipe={props.wipe}>
        <div className="nl-board" style={{ display: 'block' }}>
          {head}
          <div style={{ maxWidth: 920 }}>
            <Wait s={s} c={c} />
            {lost ? <div className="enc-row" role="alert"><Dot on={false} /><span className="enc-rn" style={{ color: 'var(--doc-critical,#7F2A14)' }}>Lost the table</span>
              <Btn cls="hp-commit" onClick={() => T.rejoin()}>JOIN AGAIN</Btn></div> : null}
            {away ? <div className="enc-row" role="status" data-camp-online="gmAway"><Dot on={false} /><span className="enc-rn">The GM dropped — waiting</span></div> : null}
            {c.inbox.length || book ? (
              <section><Sechead t="INBOX" />
                {c.inbox.map(o => <div key={o.id} className="enc-row" data-camp-offer={o.id}><span className="enc-rn">{'+' + o.amount + ' XP · from ' + o.fromLabel}</span>
                  <Btn cls="hp-commit" disabled={!myIds.length} onClick={() => add(o)}>ADD</Btn><Btn onClick={() => drop(o)}>DISMISS</Btn></div>)}
                {book ? <div className="enc-row"><span className="enc-rn">{'Your table plays ' + book}</span>
                  <Btn cls="hp-commit" onClick={() => props.onUseBook && props.onUseBook(c.frame)}>USE</Btn>
                  <Btn onClick={() => props.onChangeBook && props.onChangeBook(c.frame)}>CHANGE</Btn></div> : null}
              </section>
            ) : null}
            <section><Sechead t="PARTY" right={linked ? <span className="hp-cite" style={{ order: 2 }}>read only while at the table</span> : null} />
              <div className="nl-mstrip" style={{ flexWrap: 'wrap', padding: '2px 0' }}>{members(c).map(m => <Chip key={m.who} name={memberName(m)} />)}</div></section>
            <section><Sechead t="MY CHARACTERS" />
              {!myIds.length ? <div className="enc-row" data-camp-nochar="1"><span className="enc-rn">No characters yet</span>
                <Btn cls="hp-commit" onClick={() => props.onMakeCharacter && props.onMakeCharacter()}>MAKE ONE</Btn></div>
                : myIds.map(id => { const r = charRec(id); return <div key={id} className="enc-row"><Mono name={r.name} /><span className="enc-rn">{r.name}<small>{charLine(r)}</small></span></div>; })}
            </section>
          </div>
        </div>
      </Shell>
    );
  }

  // ── the one mount: props.role 'gm' | 'player', props.route, props.go, props.onBack ──
  function Campaigns(props) {
    const tick = useTick(), s = useSession(), shellRef = useRef(null);
    useRejoin();
    const durs = (window.SWRPGUI && window.SWRPGUI.WIPE_DURATIONS) || {};   // the library's wipe, read the library's way
    const wipe = props.wipeType ? props.wipeType + ' ' + (durs[props.wipeType] != null ? durs[props.wipeType] : 1.3) + 's cubic-bezier(0.42,0,0.18,1) forwards' : undefined;
    const p = Object.assign({}, props, { shellRef: shellRef, route: props.route || {}, wipe: wipe });
    const Cs = C();
    if (!Cs || !TS()) return null;
    const c = p.route.id ? Cs.campaignOf(Cs.load(), p.route.id) : null;
    if (p.role === 'gm') return c && c.role === 'gm' ? <GmCampaign props={p} s={s} tick={tick} c={c} /> : <GmList props={p} s={s} tick={tick} />;
    if (p.route.join != null) return <PlJoin props={p} s={s} tick={tick} />;
    return c && c.role === 'player' ? <PlCampaign props={p} s={s} tick={tick} c={c} /> : <PlList props={p} tick={tick} />;
  }

  window.SWRPGCampaignsView = { Campaigns: Campaigns, oneTap: oneTap, showCode: showCode, JOIN_URL: JOIN_URL, bookName: bookName, qrSvg: qrSvg };
})();

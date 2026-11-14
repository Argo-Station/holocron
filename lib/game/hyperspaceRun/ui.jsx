/**
 * Hyperspace Run — game UI overlay (loaded as text/babel, like diceUI.jsx).
 * Defines a global <HyperspaceRunGame> the GM map screen mounts over GalaxyMapView
 * in "game mode". Pure presentation over the rules engine (window.HyperRun); all
 * game logic lives in lib/game/hyperspaceRun/rules.js. See HYPERSPACE_RUN_SPEC.
 */
/* global React */
(function () {
  const { useState } = React;
  const ACCENT = '#4EAAFF';
  const PANEL = {
    position: 'absolute', inset: 0, zIndex: 600, display: 'flex',
    flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
    padding: '18px 14px', overflowY: 'auto',
    background: 'radial-gradient(ellipse at 50% 0%, rgba(8,16,28,0.78), rgba(3,6,12,0.92))',
    backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
    fontFamily: 'var(--font-body)', color: '#cfe3ff',
  };
  const H = (txt, sub) => (
    <div style={{ textAlign: 'center', marginBottom: '14px' }}>
      <div style={{ fontFamily: "'Orbitron', monospace", fontSize: '18px', letterSpacing: '0.16em', color: ACCENT }}>{txt}</div>
      {sub ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.18em', opacity: 0.6, marginTop: '3px' }}>{sub}</div> : null}
    </div>
  );
  const btn = (extra) => Object.assign({
    minHeight: '44px', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer',
    background: `${ACCENT}1A`, border: `1px solid ${ACCENT}66`, color: '#eaf4ff',
    fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.1em',
    touchAction: 'manipulation',
  }, extra || {});
  const card = {
    width: '100%', maxWidth: '460px', padding: '12px 14px', marginBottom: '8px',
    borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)',
  };
  const credits = (n) => (n || 0).toLocaleString() + ' cr';

  function StatBar({ gs }) {
    if (!gs.ship) return null;
    const s = gs.ship;
    const cell = (label, val, warn) => (
      <div style={{ textAlign: 'center', minWidth: '56px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', letterSpacing: '0.14em', opacity: 0.55 }}>{label}</div>
        <div style={{ fontFamily: "'Orbitron', monospace", fontSize: '13px', color: warn ? '#FF6B6B' : '#fff' }}>{val}</div>
      </div>
    );
    return (
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center',
        width: '100%', maxWidth: '460px', marginBottom: '12px', padding: '8px',
        borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: `1px solid ${ACCENT}33` }}>
        {cell('CREDITS', credits(gs.credits))}
        {cell('HULL', s.hull + '/' + s.hull_max, s.hull <= s.hull_max * 0.34)}
        {cell('STRAIN', s.strain + '/' + s.strain_max)}
        {cell('DRIVE', s.hyperdrive_ok ? 'OK' : 'DEAD', !s.hyperdrive_ok)}
        {gs.contract ? cell('DAYS LEFT', gs.clock.days_left, gs.clock.days_left < 0) : null}
      </div>
    );
  }

  function HyperspaceRunGame(props) {
    const HR = window.HyperRun, D = window.HyperRunData;
    const galaxy = { planets: props.planets || [], routes: props.routes || [], graph: props.graph };
    const [gs, setGs] = useState(() => HR.initRun(Math.floor(Math.random() * 1e9)));
    const [push, setPush] = useState(false);
    const [routing, setRouting] = useState(false);
    const set = (next) => setGs(next);

    const closeBtn = (
      <button type="button" onClick={props.onExit} aria-label="Exit game"
        style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 2, width: '44px', height: '44px',
          borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.35)',
          color: '#fff', cursor: 'pointer', fontSize: '16px' }}>×</button>
    );

    let body = null;

    if (gs.phase === 'SHIP_SELECT') {
      body = (
        <React.Fragment>
          {H('HYPERSPACE RUN', 'CHOOSE YOUR SHIP · ' + credits(gs.credits) + ' to spend')}
          {D.SHIPS.map((sh) => (
            <button key={sh.key} type="button" onClick={() => set(HR.selectShip(gs, sh.key))}
              style={Object.assign({}, card, { textAlign: 'left', cursor: 'pointer' })}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontFamily: "'Orbitron', monospace", fontSize: '13px', color: '#fff' }}>{sh.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: ACCENT }}>{credits(sh.price)}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.12em', color: ACCENT, opacity: 0.8, margin: '2px 0 4px' }}>{sh.archetype.toUpperCase()}</div>
              <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>{sh.blurb}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', opacity: 0.7 }}>
                DRIVE {sh.hyperdrive_class} · CARGO {sh.cargo_capacity} · HULL {sh.hull_max} · EVADE {sh.speed}/{sh.handling >= 0 ? '+' + sh.handling : sh.handling}
              </div>
            </button>
          ))}
        </React.Fragment>
      );
    } else if (gs.phase === 'OUTFIT') {
      const c = gs.contract;
      const ready = HR.canPlot(gs);
      if (routing) {
        const opts = HR.routeOptions(gs, galaxy);
        body = (
          <React.Fragment>
            {H('PLOT THE COURSE', c.origin + ' → ' + c.destination)}
            {opts.map((o) => (
              <button key={o.key} type="button" onClick={() => { setRouting(false); set(HR.plotRoute(gs, galaxy, o.key)); }}
                style={Object.assign({}, card, { textAlign: 'left', cursor: 'pointer' })}>
                <div style={{ fontFamily: "'Orbitron', monospace", fontSize: '13px', color: o.key === 'direct' ? '#FFC857' : '#9fe8c0' }}>{o.label}</div>
                <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '3px' }}>{o.note}</div>
              </button>
            ))}
            <button type="button" onClick={() => setRouting(false)} style={btn({ marginTop: '6px', background: 'transparent' })}>← BACK</button>
          </React.Fragment>
        );
      } else {
        body = (
          <React.Fragment>
            {H('OUTFIT & CONTRACT', gs.ship.name + ' · ' + credits(gs.credits))}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.16em', color: ACCENT, opacity: 0.7, alignSelf: 'center', marginBottom: '4px' }}>PICK A JOB</div>
            {D.CONTRACTS.map((ct) => {
              const fits = gs.ship.cargo_capacity >= ct.cargo_required;
              const on = c && c.id === ct.id;
              return (
                <button key={ct.id} type="button" disabled={!fits} onClick={() => set(HR.acceptContract(gs, ct.id))}
                  style={Object.assign({}, card, { textAlign: 'left', cursor: fits ? 'pointer' : 'not-allowed',
                    opacity: fits ? 1 : 0.4, border: on ? `1px solid ${ACCENT}` : card.border })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: "'Orbitron', monospace", fontSize: '12px', color: '#fff' }}>{ct.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#9fe8c0' }}>{credits(ct.payout)}</span>
                  </div>
                  <div style={{ fontSize: '11px', opacity: 0.75, margin: '2px 0' }}>{ct.blurb}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', opacity: 0.7 }}>
                    {ct.cargo_required}u {fits ? '' : '(too big for your hold!) '}· {credits(ct.cargo_required * ct.unit_buy)} cargo · {ct.deadline_days}d deadline
                  </div>
                </button>
              );
            })}
            {c ? (
              <div style={{ width: '100%', maxWidth: '460px', display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                <button type="button" onClick={() => set(HR.buyCargo(gs, c.cargo_required))} style={btn({ flex: '1 1 46%' })}>
                  {gs.cargo.units >= c.cargo_required ? '✓ CARGO LOADED' : 'LOAD CARGO (' + credits(c.cargo_required * c.unit_buy) + ')'}
                </button>
                {D.ITEMS.map((it) => (
                  <button key={it.key} type="button" onClick={() => set(HR.buyItem(gs, it.key))} style={btn({ flex: '1 1 46%' })}>
                    + {it.name.toUpperCase()} ({gs.inventory[it.key] || 0}) · {credits(it.price)}
                  </button>
                ))}
                <button type="button" disabled={!ready} onClick={() => setRouting(true)}
                  style={btn({ flex: '1 1 100%', opacity: ready ? 1 : 0.4, cursor: ready ? 'pointer' : 'not-allowed',
                    background: ready ? `${ACCENT}33` : 'transparent', fontSize: '12px' })}>
                  PLOT COURSE →
                </button>
              </div>
            ) : null}
          </React.Fragment>
        );
      }
    } else if (gs.phase === 'TRANSIT') {
      const prev = HR.legPreview(gs, push);
      const n = gs.route.legs.length;
      body = (
        <React.Fragment>
          {H('IN TRANSIT', gs.contract.destination + ' · leg ' + (gs.route.legIndex + 1) + ' of ' + n)}
          <StatBar gs={gs} />
          {prev ? (
            <div style={Object.assign({}, card, { maxWidth: '460px' })}>
              <div style={{ fontFamily: "'Orbitron', monospace", fontSize: '13px', color: '#fff', marginBottom: '4px' }}>{prev.leg.from} → {prev.leg.to}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: prev.pool.difficulty === 'Average' ? '#FFC857' : '#3AFFA0' }}>
                {prev.pool.difficulty.toUpperCase()} ASTROGATION
                {prev.pool.boost ? ' · +' + prev.pool.boost + ' BOOST' : ''}
                {prev.pool.setback ? ' · +' + prev.pool.setback + ' SETBACK' : ''}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.75, marginTop: '4px' }}>{prev.days} day{prev.days !== 1 ? 's' : ''} · {prev.pool.reason}</div>
            </div>
          ) : null}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '6px 0', fontFamily: 'var(--font-mono)', fontSize: '11px', cursor: 'pointer' }}>
            <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} />
            PUSH THE DRIVE — faster, +strain, harder check
          </label>
          <button type="button" onClick={() => { const next = HR.resolveLeg(gs, { push: push }); setPush(false); set(next); }}
            style={btn({ fontSize: '13px', background: `${ACCENT}33`, minWidth: '180px' })}>JUMP ▸</button>
          {gs.lastRoll ? <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '8px' }}>{gs.log[gs.log.length - 1]}</div> : null}
        </React.Fragment>
      );
    } else if (gs.phase === 'EVENT') {
      const ev = gs.pendingEvent;
      body = (
        <React.Fragment>
          {H(ev.title.toUpperCase(), 'EVENT')}
          <StatBar gs={gs} />
          <div style={Object.assign({}, card, { fontSize: '13px', lineHeight: 1.5 })}>{ev.prompt}</div>
          {ev.choices.map((ch) => (
            <button key={ch.id} type="button" onClick={() => set(HR.applyEventChoice(gs, ch.id))} style={btn({ width: '100%', maxWidth: '460px', textAlign: 'left' })}>{ch.label}</button>
          ))}
        </React.Fragment>
      );
    } else if (gs.phase === 'ARRIVE') {
      body = (
        <React.Fragment>
          {H('ARRIVAL', gs.contract.destination)}
          <StatBar gs={gs} />
          <button type="button" onClick={() => set(HR.settle(gs))} style={btn({ fontSize: '13px', background: `${ACCENT}33`, minWidth: '200px' })}>DELIVER CARGO ▸</button>
        </React.Fragment>
      );
    } else if (gs.phase === 'END') {
      const r = gs.result || {};
      body = (
        <React.Fragment>
          {H(r.success ? 'CONTRACT COMPLETE' : 'RUN OVER', r.success ? 'PAYOUT ' + credits(r.payout) : 'FAILED')}
          <div style={Object.assign({}, card, { textAlign: 'center', fontSize: '14px' })}>{r.reason}</div>
          <div style={{ fontFamily: "'Orbitron', monospace", fontSize: '20px', color: ACCENT, margin: '8px 0' }}>SCORE {credits(r.score)}</div>
          <button type="button" onClick={() => { setPush(false); setRouting(false); set(HR.initRun(Math.floor(Math.random() * 1e9))); }} style={btn({ fontSize: '13px', minWidth: '160px', marginBottom: '6px' })}>NEW RUN</button>
          <button type="button" onClick={props.onExit} style={btn({ background: 'transparent' })}>EXIT TO MAP</button>
        </React.Fragment>
      );
    }

    return <div data-hsr="1" style={PANEL}>{closeBtn}{body}</div>;
  }

  window.HyperspaceRunGame = HyperspaceRunGame;
})();

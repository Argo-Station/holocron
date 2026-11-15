/* lib/shared/treeView.jsx — F-100 M5 C7: the ONE talent / Force-power tree, lifted out of player/app.jsx.
 *
 * Ruling `f100-m5-contracts` §3 C7 (R-M5K; plan with numbers from the JOB 1 brief's M-4): the 11-function block —
 * the five `fcTalent*` rules, `dtCellSkin`, `DirectionalTreeEntryBody`, `DirectionalTreeSheet`, `DirectionalTree`,
 * `talentTreeToModel`, `forcePowerToModel` — MOVED WHOLE and verbatim (832 function lines), so both faces and the
 * homebrew editor mount ONE tree (0 second tree components). window.SWRPGTree = { DirectionalTree, … , configure }.
 * Compiled classic-script transform (build.mjs) → loads after /vendor.js and before /lib/editor/view.js in both
 * index.html files; React and ReactDOM are global.
 *
 * THE FIVE PLAYER-ONLY IDENTIFIERS ARE INJECTED, NEVER MOVED (C7.2). `glyphs`, `PROSE_GLYPH_SIZE` and `cleanMarkup` stay
 * pinned in player/app.jsx by test/decoder_family_parity.cjs; `gameLineTitle` / `FC_GAME_LINES` stay there too. The
 * player calls `SWRPGTree.configure({ clean, glyphs, cite })` at module top with its own three, so the player's tree
 * draws byte-for-byte as before. A face that injects nothing (the GM face) takes the degrade path below: the shared
 * drawer and eater, read off `window` at CALL time, and the raw string when a drawer is absent — never null.
 * The block below sits at column 0 on purpose: test/tree_skin_parity.cjs slices it by `function NAME(` … `}`.
 */
(function () {

// THE EATER — the host's (player/app.jsx cleanMarkup), else the shared one on window.SWItems (lib/items.js, both faces).
function cleanMarkup(text) {
  var E = (window.SWRPGTree && window.SWRPGTree.env) || {};   // self-contained: test/tree_skin_parity.cjs slices this function alone
  if (typeof E.clean === 'function') return E.clean(text);
  var I = window.SWItems;
  return (I && typeof I.cleanMarkup === 'function') ? I.cleanMarkup(text) : (text || '');
}

// THE DRAWER — the host's adapter (player/app.jsx glyphs, PROSE_GLYPH_SIZE), else window.SWRPGUI.glyphText at its own
// default size. DEGRADE RULE: no drawer → the RAW STRING, never null.
function glyphs(text, size, opts) {
  var E = (window.SWRPGTree && window.SWRPGTree.env) || {};   // self-contained: test/tree_skin_parity.cjs slices this function alone
  if (typeof E.glyphs === 'function') return E.glyphs(text, size, opts);
  var U = window.SWRPGUI || {};
  return typeof U.glyphText === 'function' ? U.glyphText(text, size, opts) : text;
}

// THE CITE LABELLER — the host's (player/app.jsx gameLineTitle over SWRPGSources.sourceLabel), else sourceLabel itself.
function gameLineTitle(id) {
  var E = (window.SWRPGTree && window.SWRPGTree.env) || {};   // self-contained: test/tree_skin_parity.cjs slices this function alone
  if (typeof E.cite === 'function') return E.cite(id);
  var S = window.SWRPGSources;
  return (S && typeof S.sourceLabel === 'function') ? (S.sourceLabel(id) || id) : id;
}

// The ONE activation formatter (lib/shared/ui.jsx), read at call time.
function formatActivation(a) { return window.SWRPGUI.formatActivation(a); }

function fcTalentIsPurchased(specKey, row, col, talents) {
  return !!(talents[specKey + '_r' + row + 'c' + col]);
}

/* B-84 — CHEAPEST LEGAL XP TO OWN EACH CELL.
   The number printed on a talent is its ROW PRICE, not its cost. Owning a bottom-row talent needs
   75-110 XP of connected path first, and the screen never said so: `statusLabel` is `row.cost` at
   every depth, and the locked hint gives the RULE ("BUY A CONNECTED ONE IN ROW 1-n FIRST") without
   the TOTAL.

   Row 0 is always available (`fcTalentIsAvailable` below); every other cell needs a PURCHASED
   neighbour whose link points back. So the cheapest way to own a cell is a shortest path through
   the link graph where a node's weight is its row cost — Dijkstra, NOT a row sum, because the
   cheapest route can move sideways. Measured across the shipped trees: row 2 = 15 · row 3 = 30-40 ·
   row 4 = 50-75 · row 5 = 75-110, and 2 of 129 trees (Marauder, Scholar) need 110 — more than the
   modal 100 XP starting pool by itself, on an identical grid with identical row prices. Only the
   links differ, which is why this cannot be read off the screen.

   Returns a Map keyed "r,c" -> cheapest total XP to own that cell (its own row cost included). */
function fcTalentReachCosts(treeData, crossFreeIds) {
  var DIRS = [[1, 0, 'down', 'up'], [-1, 0, 'up', 'down'],
              [0, 1, 'right', 'left'], [0, -1, 'left', 'right']];
  var R = (treeData || []).length;
  if (!R) return {};
  var C = (treeData[0].talents || []).length;
  var isFree = function(r, c) {
    if (!crossFreeIds) return false;
    var row = treeData[r]; var cell = row && row.talents ? row.talents[c] : null;
    return cell && crossFreeIds.indexOf(cell.talent) !== -1;
  };
  var cellCost = function(r, c) { return isFree(r, c) ? 0 : ((treeData[r] && treeData[r].cost) || 0); };
  var linksAt = function(r, c) {
    var row = treeData[r]; var cell = row && row.talents ? row.talents[c] : null;
    return (cell && cell.links) || null;                    // null = no cell there at all
  };
  // Small graphs (5x4): a linear scan for the minimum beats a heap and keeps this readable.
  var dist = {}, queue = [];
  for (var c0 = 0; c0 < C; c0++) {
    if (!linksAt(0, c0)) continue;
    var cost0 = cellCost(0, c0);
    dist['0,' + c0] = cost0;
    queue.push([cost0, 0, c0]);
  }
  while (queue.length) {
    var bi = 0;
    for (var i = 1; i < queue.length; i++) if (queue[i][0] < queue[bi][0]) bi = i;
    var cur = queue.splice(bi, 1)[0], d = cur[0], r = cur[1], c = cur[2];
    if (dist[r + ',' + c] < d) continue;
    for (var k = 0; k < DIRS.length; k++) {
      var nr = r + DIRS[k][0], nc = c + DIRS[k][1];
      if (nr < 0 || nr >= R || nc < 0 || nc >= C) continue;
      var mine = linksAt(r, c), theirs = linksAt(nr, nc);
      if (!mine || !theirs) continue;
      if (!mine[DIRS[k][2]] || !theirs[DIRS[k][3]]) continue;   // the link must point BOTH ways
      var nd = d + cellCost(nr, nc), key = nr + ',' + nc;
      if (dist[key] == null || nd < dist[key]) { dist[key] = nd; queue.push([nd, nr, nc]); }
    }
  }
  return dist;
}

// EotE p.93: a non-ranked talent owned elsewhere counts as purchased for connection purposes.
function fcTalentIsConnected(specKey, row, col, treeData, talents, crossFreeIds) {
  if (fcTalentIsPurchased(specKey, row, col, talents)) return true;
  if (crossFreeIds) {
    var cell = treeData[row] && treeData[row].talents ? treeData[row].talents[col] : null;
    if (cell && crossFreeIds.indexOf(cell.talent) !== -1) return true;
  }
  return false;
}

function fcTalentIsAvailable(specKey, row, col, treeData, talents, crossFreeIds) {
  // Row 0 is always available
  if (row === 0) return true;
  var thisRow = treeData[row];
  var thisCell = thisRow ? thisRow.talents[col] : null;
  if (!thisCell) return false;

  // Check connected neighbors (canonical cells carry links{up,down,left,right})
  var L = thisCell.links || {};
  // Up connection
  if (L.up && row > 0) {
    var aboveRow = treeData[row - 1];
    var aboveCell = aboveRow ? aboveRow.talents[col] : null;
    if (aboveCell && (aboveCell.links || {}).down && fcTalentIsConnected(specKey, row - 1, col, treeData, talents, crossFreeIds)) return true;
  }
  // Left connection
  if (L.left && col > 0) {
    var leftCell = thisRow.talents[col - 1];
    if (leftCell && (leftCell.links || {}).right && fcTalentIsConnected(specKey, row, col - 1, treeData, talents, crossFreeIds)) return true;
  }
  // Right connection
  if (L.right && col < thisRow.talents.length - 1) {
    var rightCell = thisRow.talents[col + 1];
    if (rightCell && (rightCell.links || {}).left && fcTalentIsConnected(specKey, row, col + 1, treeData, talents, crossFreeIds)) return true;
  }
  // Down connection (unusual but possible)
  if (L.down && row < treeData.length - 1) {
    var belowRow = treeData[row + 1];
    var belowCell = belowRow ? belowRow.talents[col] : null;
    if (belowCell && (belowCell.links || {}).up && fcTalentIsConnected(specKey, row + 1, col, treeData, talents, crossFreeIds)) return true;
  }
  return false;
}

// RAW: row-0 talents are PURCHASED (not granted), so they're refundable like any other — subject to
// the same orphan check below (refunding one that a higher talent connects THROUGH is blocked).
function fcTalentIsRefundable(specKey, row, col, treeData, talents, crossFreeIds) {
  // Check if removing this talent would orphan any purchased talent
  var simulated = Object.assign({}, talents);
  delete simulated[specKey + '_r' + row + 'c' + col];

  for (var posKey in simulated) {
    var t = simulated[posKey];
    if (t.specKey !== specKey) continue;
    if (t.row === 0) continue; // row 0 always valid
    if (!fcTalentIsAvailable(specKey, t.row, t.col, treeData, simulated, crossFreeIds)) return false;
  }
  return true;
}

/* ══════════════════════════════════════════════════════════════════════════════
   DirectionalTree — the ONE tree component (ruling tree-standardization-brief).
   Renders a normalized directional grid for BOTH talents and Force-power upgrades;
   the Force tree's SHEET_PANEL cell skin wins, the talent tree's TreeFitBox fit wins
   (rendered at the 82/78 talent geometry so TreeFitBox's 66px floor holds). Two thin
   adapters (talentTreeToModel / forcePowerToModel) own ALL domain knowledge and
   produce the model; this component knows nothing about talents vs powers.

   model = { specKey, rows: [ { cost:Number|null, cells: [cell|null ×4] } ] }
   cell  = { key, title, statusLabel, state:'owned'|'available'|'locked'|'free'|'granted',
             up,down,left,right (Booleans), span:Number, filler:Bool, ownedDot:Bool,
             entry:{ name, meta, desc, buy:{state,cost,label,doBuy}|null, refund:{label,doRefund}|null } }
   Desktop: a tapped cell → onInspect(cell.entry) (the DETAILS pane teaches + buys).
   Mobile (onInspect absent): the component's ONE bottom sheet renders cell.entry.
   ────────────────────────────────────────────────────────────────────────────── */

// Cell skin by state — the SHEET_PANEL idiom (gradient + inset highlight + owned-glow), lifted from
// ForcePowerTreeView (the ruled canonical). owned/granted share the accent-glow fill; free reads as
// available (known-but-free); locked bakes muted colors (no opacity dim → title stays ≥3:1).
function dtCellSkin(accent, state) {
  if (state === 'owned' || state === 'granted') {
    return { bg: 'linear-gradient(180deg,' + accent + '30,' + accent + '12)', borderCol: accent + '99', textCol: accent, statusCol: accent, cellShadow: '0 1px 0 rgba(255,255,255,.06) inset, 0 4px 14px ' + accent + '22' };
  }
  if (state === 'available' || state === 'free') {
    return { bg: 'linear-gradient(180deg,rgba(255,255,255,0.085),rgba(255,255,255,0.022))', borderCol: 'rgba(255,255,255,0.26)', textCol: '#FFFFFF', statusCol: 'rgba(255,255,255,0.72)', cellShadow: '0 1px 0 rgba(255,255,255,.05) inset' };
  }
  return { bg: 'linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))', borderCol: 'rgba(255,255,255,0.11)', textCol: 'rgba(255,255,255,0.52)', statusCol: 'rgba(255,255,255,0.4)', cellShadow: 'none' };
}

// The ONE mobile bottom sheet (retires FCTalentDetail + ForcePowerTreeView's detailPanel). Renders the
// same normalized entry the DETAILS pane shows on desktop — one teaching+buy surface, two platform idioms.
/* THE ENTRY BODY — ONE presentation, two containers (R-CUI-2 applied to ourselves).
   Extracted from DirectionalTreeSheet when the creator's desktop rail (B-86) was first written as a
   PARALLEL presentation and immediately drifted: it dropped the activation line, the source cite and
   the entire buy-state vocabulary (PURCHASE / NOT ENOUGH XP / PREREQUISITES NOT MET / STARTING ·
   GRANTED / refund). `smoke_3a` caught it. The lesson is the lap's own thesis, turned on the fix:
   adopting means SHARING THE PRESENTATION, not writing a second one that happens to look similar.
   The bottom sheet and the rail now differ only in their container chrome. */
/* B-591 (Jason 2026-09-14: "need a paper version of the purchase UI") — `paper` draws this body in
   the creator ground's own idiom: mono meta line, `hp-prose`, `hp-cite` chips, the red `hp-commit`
   for the act and its quiet variant for REFUND, `hp-why` for a refusal. Without it the legacy
   dark drawer draws exactly as before (the default skin, the sheet's FORCE tab, ADVANCEMENT). */
function DirectionalTreeEntryBody({ entry, accent, afterAction, paper }) {
  if (!entry) return null;
  const buy = entry.buy;
  const P = !!paper;
  return (
    <React.Fragment>
        {(entry.activationLine || entry.meta) && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.14em', color: P ? 'var(--doc-ink-muted)' : 'rgba(255,255,255,0.7)', marginBottom: '10px' }}>{entry.activationLine || entry.meta}</div>}
      {entry.desc && <div className={P ? 'hp-prose' : undefined} style={{ fontFamily: 'var(--font-body)', fontSize: P ? '16px' : 'var(--fs-sm)', lineHeight: 1.55, color: P ? 'var(--doc-ink)' : 'rgba(255,255,255,0.72)', marginBottom: '8px' }}>{glyphs(cleanMarkup(entry.desc))}</div>}
      {entry.buyingDoes && <div className={P ? 'hp-none' : undefined} style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-xs)', lineHeight: 1.5, color: P ? 'var(--doc-ink-muted)' : 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>{entry.buyingDoes}</div>}
      {/* B-84: the ROUTE — what owning THIS cell costs, not what its row costs. The gutter's ↓n is
          the cheapest way into the row; this is the cheapest way to this cell, and the two differ
          (a ↓75 gutter beside a cell that costs 100 is exactly the gap the shipped screen could
          not express). Rendered in the shared body so the bottom sheet and the desktop rail both
          carry it. */}
      {entry.reachLine && <div data-reach-line className={P ? 'hp-why' : undefined} style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-xs)', lineHeight: 1.5, color: P ? undefined : 'var(--text-caution)', marginBottom: '8px' }}>{entry.reachLine}</div>}
      {entry.sourceCite && (P
        ? <div style={{ marginBottom: '12px' }}>{String(entry.sourceCite).split(' \u00b7 ').map(function(c) { return <span className="hp-cite" key={c} style={{ marginRight: '7px', marginBottom: '6px' }}>{c}</span>; })}</div>
        : <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '12px' }}>{entry.sourceCite}</div>)}
      {/* Full state set (mirrors the retired FCTalentDetail / Force detailPanel): buyable · free · needxp ·
          locked (prereqs) · granted · owned(+refund/cannot-refund). */}
      {buy && (buy.state === 'buyable' || buy.state === 'free') && (
        <button type="button" data-testid="talent-buy" data-buy-state={buy.state} onClick={() => { buy.doBuy(); afterAction(); }}
          className={P ? 'hp-commit' : undefined} style={P ? { width: '100%' } : {
          width: '100%', padding: '14px', borderRadius: '8px', cursor: 'pointer', minHeight: '48px', border: 'none',
          background: accent, color: '#000',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-xs)', letterSpacing: '0.1em',
        }}>{buy.state === 'free' ? 'ALREADY KNOWN — CLAIM FREE'
              : entry.isChoiceTalent ? ('CONFIRM + CHOOSE YOUR SKILLS — ' + (buy.cost || 0) + ' XP')
              : ('PURCHASE — ' + (buy.cost || 0) + ' XP')}</button>
      )}
      {buy && buy.state === 'needxp' && (
        <div className={P ? 'hp-why' : undefined} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', color: P ? undefined : 'var(--text-danger)', textAlign: 'center', padding: '12px', letterSpacing: '0.04em' }}>NOT ENOUGH XP</div>
      )}
      {buy && buy.state === 'held' && (
        <div className={P ? 'hp-why' : undefined} data-testid="talent-held" role="status" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-xs)', lineHeight: 1.5, padding: '12px' }}>{buy.reason}</div>
      )}
      {buy && buy.state === 'locked' && (
        <div style={{ textAlign: 'center', padding: '12px' }}>
          <div className={P ? 'hp-why' : undefined} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.18em', color: P ? undefined : 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>PREREQUISITES NOT MET</div>
          {entry.lockedHint > 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.14em', color: P ? 'var(--doc-ink)' : 'rgba(255,255,255,0.85)' }}>{'BUY A CONNECTED ONE IN ROW ' + (entry.lockedHint === 1 ? '1' : '1–' + entry.lockedHint) + ' FIRST'}</div>}
          {/* F-100 creator concept R1: the reason slot — a locked cell that carries its own words (the signature tree's V5–V7) */}
          {buy.reason && <div className={P ? 'hp-why' : undefined} data-testid="tree-locked-reason" role="status" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-xs)', lineHeight: 1.5, paddingTop: '4px' }}>{buy.reason}</div>}
        </div>
      )}
      {buy && buy.state === 'granted' && <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em', color: P ? 'var(--doc-accent)' : accent, opacity: 0.85 }}>STARTING · GRANTED</div>}
      {entry.refund && (
        <button type="button" onClick={() => { entry.refund.doRefund(); afterAction(); }}
          className={P ? 'hp-commit' : undefined} data-refused={P ? '1' : undefined} style={P ? { width: '100%', marginTop: '8px' } : {
          width: '100%', marginTop: '8px', padding: '14px', borderRadius: '8px', cursor: 'pointer', minHeight: '44px',
          background: 'rgba(255,107,107,0.1)', border: '1px solid #FF6B6B40', color: 'var(--text-danger)',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-xs)', letterSpacing: '0.1em',
        }}>{entry.refund.label || ('REFUND — +' + (buy && buy.cost || 0) + ' XP')}</button>
      )}
      {buy && buy.state === 'owned' && !entry.refund && !entry.needsChoice && (
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-xs)', letterSpacing: '0.12em', color: P ? (entry.cannotRefund ? 'var(--doc-ink-muted)' : 'var(--doc-accent)') : (entry.cannotRefund ? 'rgba(255,255,255,0.6)' : accent), padding: '4px' }}>{entry.cannotRefund ? 'CANNOT REFUND — OTHERS DEPEND ON THIS' : '✦ OWNED'}</div>
      )}
      {/* B-181 legacy migration (ruling talent-choice-legacy-migration §8): an OWNED choice-talent whose
          career skills were never chosen. The prompt appears on its own (R-TCLM-2) but nothing changes
          until the player taps CHOOSE — choose-in-place, no XP, no refund. */}
      {entry.needsChoice && entry.choose && (
        <div className={P ? 'hp-plate' : undefined} data-pad={P ? 'read' : undefined} style={P ? { marginTop: '8px' } : { marginTop: '8px', padding: '11px 12px', borderRadius: '8px', border: '1px solid rgba(255,200,87,0.34)', background: 'rgba(255,200,87,0.07)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.14em', color: 'var(--text-caution)', marginBottom: '5px' }}>OWNED · NEEDS ITS SKILLS</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--fs-xs)', lineHeight: 1.5, color: P ? 'var(--doc-ink)' : 'rgba(255,255,255,0.72)', marginBottom: '9px' }}>Choose its skills now. No extra XP.</div>
          <button type="button" onClick={() => { entry.choose.doChoose(); afterAction(); }} style={{ width: '100%', padding: '13px', borderRadius: '8px', cursor: 'pointer', minHeight: '46px', border: 'none', background: 'var(--text-caution)', color: '#1a1400', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-xs)', letterSpacing: '0.1em' }}>{entry.choose.label}</button>
        </div>
      )}
      {/* The receipt (R-TCPK-1 record, not control): the career skills this choice-talent made career. */}
      {entry.choiceReceipt && entry.choiceReceipt.length > 0 && (
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: P ? '1px solid var(--doc-rule)' : '1px solid rgba(255,255,255,0.1)', fontFamily: 'var(--font-body)', fontSize: 'var(--fs-xs)', color: P ? 'var(--doc-ink)' : 'rgba(255,255,255,0.86)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.14em', color: 'var(--text-success)', marginBottom: '3px' }}>CAREER SKILLS CHOSEN</div>
          {entry.choiceReceipt.join(' · ')}
        </div>
      )}
      {/* F-100 M7 W4 (R-M7G-23): the characteristic-choice receipt — a record, not a control, in W4's words. */}
      {entry.charChoiceReceipt && (
        <p data-testid="talent-char-receipt" style={{ margin: '10px 0 0', paddingTop: '10px', borderTop: '1px solid ' + (P ? 'var(--doc-rule)' : 'var(--text-faint)'), fontFamily: 'var(--font-body)', fontSize: P ? '16px' : 'var(--fs-sm)', lineHeight: 1.5, color: P ? 'var(--doc-ink)' : undefined }}>{entry.charChoiceReceipt}</p>
      )}
    </React.Fragment>
  );
}

/* B-591 — `paper`: the sheet takes the creator ground on its own root (it is a PORTAL, outside
   every sheet's ground — the source picker's lesson, B-587) and draws as a plate rising from the
   foot: raised paper, the action rule along its top, the name in display ink, a 44px close. */
function DirectionalTreeSheet({ entry, accent, onClose, paper }) {
  // ESCAPE DISMISSES THE SHEET (B-544). The a11y floor's dismissal rule: this overlay closed only on
  // its ✕ or its scrim, so a reader who opened it from the keyboard had no way back out. The choice
  // picker (C-2) and the cell refusal (A3) were each given this route on their own cards; this is
  // the third object, and `build-phone-force` measured the gap and deferred it because the sheet is
  // shared by surfaces three cards touch.
  // ONE HANDLER, ON THE SHEET — not one per caller. Every surface that opens this sheet reaches it
  // by one of exactly TWO routes, and the card's three consumers are split across both: the phone
  // talents and Force steps press the BOARD skin's `.hp-head[role=button]`, while the NEW SPEC
  // preview presses the DEFAULT skin's cell button, as do the advancement trees behind it. A copy
  // of the same dismissal at each caller is the parallel-reimplementation defect by name, and it
  // would also have to be written once per route rather than once per screen.
  // ABOVE THE `!entry` RETURN, guarded on `entry` instead: a hook cannot sit behind a conditional
  // return, and one of the two mount sites renders this component unconditionally with a null entry.
  // CAPTURE PHASE, AND THE REASON IS MEASURED, NOT ASSUMED — it was got wrong once here. Two
  // document-level Escape listeners in the SAME phase do not stop each other: `stopPropagation`
  // holds back the next NODE, not a sibling on the same one (that is `stopImmediatePropagation`).
  // The obvious rival, `DirectionalTree`'s own refusal dismissal, turns out to be harmless — the
  // head that opens this sheet and the badge that raises a refusal are band-exclusive both ways
  // round (at 390 the tree draws 20 `.hp-head[role=button]` and 0 `[data-tal-act]`; at 1366, 0 and
  // 19), and reasoning from that pair alone said "no rival exists, bubble is fine". That was wrong.
  // The rival that proved it was the Player coach-mark overlay, which listened at the document on
  // the very surfaces that open this sheet by the default skin: with a bubble listener here, one
  // press closed the COACH MARK and left the sheet standing. THAT OVERLAY IS GONE (B-492 deleted
  // it), and the phase does NOT go with it — ruling `b544-sheet-escape` D1 ruled capture correct
  // and durable past that deletion, because "one press, one layer" is the a11y floor's dismissal
  // semantics and not a dependence on any particular rival being on screen. The history is kept
  // because it is the only reason anyone can check: the wrong answer looked right on two of the
  // three consumers.
  React.useEffect(() => {
    if (!entry) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [entry, onClose]);
  // B-1825 (ADDENDUM 631): THE SHEET HOLDS FOCUS (both faces) — in to its first control, Tab kept inside, back to the cell
  // at close. Above the `!entry` return for the reason the Escape is.
  const panelRef = React.useRef(null);
  window.SWRPGUI.useHoldFocus(panelRef, !!entry);
  if (!entry) return null;
  const buy = entry.buy;
  /* THE SHEET IS PORTALLED TO `document.body`, AND THAT IS THE WHOLE OF B-557 (Jason, 2026-09-10:
     a talent could not be bought by a finger on the phone, and the tap that tried advanced the
     creator instead).

     `z-index` ONLY COMPETES INSIDE ITS OWN STACKING CONTEXT, and this sheet was declared
     `position:fixed; z-index:200` while sitting INSIDE `.hp-phonebody`, which is itself
     `position:relative; z-index:1`. Its 200 was a loud number in a small room. The act bar
     `.hp-phoneact` is a SIBLING of `.hp-phonebody` inside `.hp-phonesheet` (which isolates), also at
     `z-index:1` — so the two TIED and the act bar won on DOM order, being written later. Measured on
     `db2549aa` at both phone bands: the drawer drew `PURCHASE — 5 XP` fully inside the viewport at
     48px, `elementFromPoint` at its own centre returned `BUTTON.hp-commit`, and a real press left
     the talents step for motivation (Step 8 of 11 -> Step 9 of 11) buying nothing. REFUND on an
     owned cell sat in the same place and was covered identically. A SCRIPTED click always worked,
     which is why every suite was green — `smoke_talents_transplant` drives the buy with `.click()`,
     and B-527's press leg hit-tests only controls present AT REST, never inside this drawer.

     RAISING A z-index WOULD HAVE FIXED THIS INSTANCE AND LEFT THE CLASS. A portal removes the sheet
     from every nested context at once, which is what a modal with a full-viewport scrim
     (`inset:0`, `rgba(2,1,10,0.55)`) is already asking for: its own declaration says "cover the
     viewport", and before this the act bar punched through that scrim undimmed. Nothing about the
     sheet's own markup, geometry or paint changes — only which room it competes in. */
  const head = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-lg)', color: paper ? 'var(--doc-ink)' : '#fff' }}>{entry.name}</div>
      <button type="button" onClick={onClose} aria-label="Close talent detail" style={{ background: 'none', border: 'none', color: paper ? 'var(--doc-ink-muted)' : 'var(--text-muted)', fontSize: 'var(--fs-xl)', cursor: 'pointer', lineHeight: 1, minHeight: '44px', minWidth: '44px' }}>{'✕'}</button>
    </div>);
  const body = <DirectionalTreeEntryBody entry={entry} accent={accent} afterAction={onClose} paper={paper} />;
  /* B-1210 (card `paper-n7-b1210-scrim-font-card` R-B1210-1/11; DECISIONS D-174): ON PAPER THE SCRIM IS AN EMPTY
     SIBLING of the sheet, the kit's `.hp-scrim` (paper.css), and the SHEET is the dialog: it carries
     `data-tree-sheet`, the ground and the band that the scrim carried, so every `[data-tree-sheet] …` reader still
     resolves. The sheet keeps today's box (full width, bottom 0, 62vh). The dim is the one paper dim: D-174 amends
     D-10/D-13's near-black for this sheet. The legacy face below is unchanged. */
  if (paper) return ReactDOM.createPortal((
    <>
      <div onClick={onClose} className="hp-scrim" data-tree-scrim="1" style={{ zIndex: 200 }} />
      <div role="dialog" aria-label={entry.name} data-tree-sheet="paper" data-doc-ground="creator" data-band="mobile" ref={panelRef}
        onClick={e => e.stopPropagation()} style={{
          position: 'fixed', zIndex: 201, left: 0, bottom: 0,
          width: '100%', maxHeight: '62vh', overflowY: 'auto',
          background: 'var(--doc-paper-raised)', borderTop: '3px solid var(--doc-action)',
          padding: '16px 16px 22px', boxShadow: 'var(--doc-lift)',
        }}>
        {head}
        {body}
      </div>
    </>
  ), document.body);
  return ReactDOM.createPortal((
    <div onClick={onClose} data-tree-sheet="legacy"
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(2,1,10,0.55)', display: 'flex', alignItems: 'flex-end' }}>
      <div ref={panelRef} onClick={e => e.stopPropagation()} style={{
        width: '100%', maxHeight: '62vh', overflowY: 'auto',
        background: 'linear-gradient(180deg,#0A0818,#05050F)', borderTop: '1px solid ' + accent + '55',
        borderRadius: '16px 16px 0 0', padding: '18px 18px 24px', boxShadow: '0 -12px 40px rgba(0,0,0,0.6)',
      }}>
        {head}
        {body}
      </div>
    </div>
  ), document.body);
}

/* `headPress` — WHERE THE PRESS AFFORDANCE SITS, and it is a BAND fact, so it is the consumer's
   (the skin is the model's, R-TTS-1, and stays there). The board draws `role="button" tabindex="0"`
   on the cell's `.hp-head` in every tree fixture at pin 6051229c; the app has always put them on the
   `.hp-tal` container. The PHONE sheet asks for the board's placement, which is also what gives it
   AS-6 for free — `paper.css:577` already sizes `.hp-head[role="button"]` at 44px, where the
   container carries no such floor. The desktop bands keep the container's role: moving it there is
   B-506's cell, in flight, and `.hp-head` at 1920 is 34px, so a universal move would trade one
   conformance for another on a surface this card does not own. The CLICK stays on the container
   either way, so every `[data-testid]` driver and a press anywhere on the cell still open the
   sheet — only the keyboard target and the accessible name move. */

function DirectionalTree({ model, accent, onInspect, onDetailToggle, headPress, headPressWhereNoBadge, onHeadPick }) {
  const [detail, setDetail] = React.useState(null);   // mobile sheet entry (when no DETAILS pane)
  const [selKey, setSelKey] = React.useState(null);
  // THE REFUSAL IS AN OVERLAY OVER A DIMMED CELL — Jason 2026-09-09, and it lives here because the
  // block that used to hold it is gone (B-506). One at a time: pressing another refusing badge
  // moves it rather than stacking. Escape dismisses (R-TCB-A6-1).
  const [refusingKey, setRefusingKey] = React.useState(null);
  React.useEffect(() => {
    if (!refusingKey) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); setRefusingKey(null); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [refusingKey]);
  React.useEffect(() => { if (onDetailToggle) onDetailToggle(!!detail); }, [detail]);   // preview hides its CONFIRM bar behind the sheet
  const rows = (model && model.rows) || [];
  const cellW = 82, cellH = 78, gap = 6, cols = 4, labelW = 34;   // talent geometry → TreeFitBox 66px floor holds
  const gridW = cols * (cellW + gap) - gap;
  const gridH = rows.length * (cellH + gap) - gap;
  const isOwned = (c) => !!c && (c.state === 'owned' || c.state === 'granted');

  // THE BADGE'S NINE FACES, one place. The PAINTED wording is Jason's (the price when pressable,
  // "REFUND +N XP" once bought — approved at `talents-cell-buy.html` @ 89cf4b5c); the ACCESSIBLE
  // NAME names the action AND the talent, because "COST 5" read aloud on its own says nothing about
  // what pressing does (R-TCB-A6-1). Three labels are approved SHORTENED because they do not fit a
  // badge: granted, locked-in and the choice talent.
  const refusalText = (cell) => {
    const e = cell.entry || {}, buy = e.buy || {};
    if (buy.state === 'held') return buy.reason;   // B-855: the reason line's own words
    // F-100 creator concept R1 (ADDENDUM 4 / 11): a `locked` cell with a reason slot speaks its own words — the signature
    // tree's V5–V7 (SIG_WORDS) — instead of the talent tree's row hint below.
    if (buy.state === 'locked' && buy.reason) return buy.reason;
    if (buy.state === 'needxp') return 'Not enough XP — ' + (buy.cost || cell.cost || 0) + ' needed.';
    const hint = e.lockedHint || cell.lockedHint || 1;
    return 'Buy a connected talent in row ' + (hint === 1 ? '1' : '1–' + hint) + ' first.';
  };

  // `chipOnly` — A THIRD REASON FOR THE CHIP, kept separate from `readTree` on purpose (A1,
  // R-BPT-A1-1). A read tree draws the chip because it has nothing to buy; the PHONE draws it
  // because the buy affordance lives on the HEAD there, and the badge must not be a second control
  // in the same cell. Overloading `readTree` would have said the phone tree is read-only, which it
  // is not — it buys, just not from the badge.
  const tabFace = (cell, readTree, chipOnly) => {
    const e = cell.entry || {};
    const buy = e.buy, cost = cell.cost != null ? cell.cost : (buy && buy.cost) || 0;
    // TWO PRICES, because the board draws two. A PRESSABLE badge paints "Cost 5" as PLAIN TEXT
    // inside its paint span; an unpressable one keeps the shipped `hp-tab-key` + number. Measured
    // on `board_talents_empty` at the catch-up pin: 4 `hp-tab-paint` (the four buyable cells) and
    // 16 `hp-tab-key` (the sixteen that are not) — never both on one badge. Parity named it.
    const priceKeyed = <React.Fragment><span className="hp-tab-key">Cost</span>{cell.cost != null ? cell.cost : ''}</React.Fragment>;
    const price = 'Cost ' + (cell.cost != null ? cell.cost : '');
    const t = cell.title || 'this talent';
    // C-3 (ruling `tree-cell-buy-in-the-cell-gate` A1, R-TCG-A1-1): the READ role. The board's
    // `tree_cell` takes no action argument at `role="read"`, so a read tree draws a COST CHIP —
    // `span.hp-tab > span.hp-tab-key` — and not a buy control. `keyed` carries that to the
    // renderer: one component with the role declared on the cell, which is what Jason's
    // one-component rule asks for; one component was never one badge regardless of role.
    if (readTree || chipOnly || !buy) return { label: priceKeyed, aria: null, press: null, kind: 'read', keyed: true };
    if (buy.state === 'buyable' || buy.state === 'free') {
      const choice = !!(e.isChoiceTalent || cell.isChoiceTalent);
      return {
        label: buy.state === 'free' ? 'Claim' : (choice ? 'Buy + skills' : price),
        aria: (buy.state === 'free' ? 'Claim ' + t + ' — already known'
               : (choice ? 'Buy ' + t + ' and choose its skills · ' : 'Buy ' + t + ' · ') + cost + ' XP'),
        press: () => { buy.doBuy(); }, kind: choice ? 'choice' : buy.state };
    }
    if (buy.state === 'held') return { label: 'Held', kind: 'locked', aria: 'Buy ' + t + ' — held, see the note above',
                                       press: () => setRefusingKey((k) => (k === cell.key ? null : cell.key)) };   // B-855 (frame H1/H2)
    if (buy.state === 'needxp' || buy.state === 'locked') {
      return { label: price, kind: buy.state,
               aria: (buy.state === 'needxp' ? 'Buy ' + t + ' · ' + cost + ' XP — not enough XP'
                      : 'Buy ' + t + ' · ' + cost + ' XP — locked'),
               /* THE CONTROL THAT OPENED THE REFUSAL CLOSES IT (R-CRG-A3-2 (3); C-2's idiom from
                  the picker, `tree-cell-buy-in-the-cell-gate` FINDING 3). The approved frame draws
                  no Close button and the a11y floor still needs a POINTER dismissal, so the badge
                  TOGGLES rather than a second object being invented: press to see why, press again
                  to put it away. Escape still dismisses, from this component's own handler. */
               press: () => setRefusingKey((k) => (k === cell.key ? null : cell.key)) };
    }
    if (e.refund) return { label: 'Refund +' + cost + ' XP', kind: 'bought',
                           aria: 'Refund ' + t + ' · +' + cost + ' XP',
                           press: () => { e.refund.doRefund(); } };
    if (buy.state === 'granted') return { label: 'Granted', aria: null, press: null, kind: 'granted' };
    if (buy.state === 'owned') return { label: e.cannotRefund ? 'Locked in' : 'Owned', aria: null,
                                        press: null, kind: e.cannotRefund ? 'depends' : 'owned' };
    return { label: priceKeyed, aria: null, press: null, kind: 'read', keyed: true };
  };

  const lines = [];
  rows.forEach((row, ri) => (row.cells || []).forEach((cell, ci) => {
    if (!cell) return;
    const x = ci * (cellW + gap) + cellW / 2, y = ri * (cellH + gap) + cellH / 2;
    if (cell.down && ri < rows.length - 1) {
      const below = rows[ri + 1] && (rows[ri + 1].cells || [])[ci];
      if (below && below.up) {
        const y2 = (ri + 1) * (cellH + gap) + cellH / 2;
        lines.push({ x1: x, y1: y + cellH / 2, x2: x, y2: y2 - cellH / 2, active: isOwned(cell) && isOwned(below), k: 'd' + ri + '_' + ci });
      }
    }
    if (cell.right && ci < cols - 1 && !cell.filler) {
      const right = (row.cells || [])[ci + 1];
      if (right && right.left && !right.filler) {
        const x2 = (ci + 1) * (cellW + gap) + cellW / 2;
        lines.push({ x1: x + cellW / 2, y1: y, x2: x2 - cellW / 2, y2: y, active: isOwned(cell) && isOwned(right), k: 'r' + ri + '_' + ci });
      }
    }
  }));

  const tap = (cell) => { setSelKey(cell.key); if (onInspect) onInspect(cell.entry); else setDetail(cell.entry); };

  // THE BOARD SKIN (ruling `talents-tree-skin` R-TTS-1): the SAME model, the SAME tap, the board's
  // cell DOM — `hp-tree > hp-tal[data-down][data-right][data-owned] > hp-head[data-state] > hp-box +
  // hp-name > hp-plate.hp-tal-body > p + hp-tab[data-state][data-tab] > hp-tab-paint` (the board's own
  // two-part badge, adopted at the catch-up pin; `test/tree_skin_parity.cjs` derives that shape from
  // `test/fixtures/board_talents_1920.html` rather than naming it here twice) — and the links
  // as the CSS pseudo-elements `paper.css` carries off `data-down` / `data-right`, computed by the
  // rule the SVG below uses (a link exists when BOTH cells claim it). Selected on the model, never on
  // a prop, so an adapter decides the skin once and every consumer of that model draws alike.
  // `interactive: false` (the spec browser's read-only preview, R-TTS-2) draws plain divs; otherwise a
  // cell is a `role="button"` the keyboard can press. The default skin below is byte-untouched.
  // ── F-100 M5 · THE AUTHOR MODE (C7.5; F7 · U1b · U10b · U11) — the same component, the board's cell DOM, and what an
  // author needs that a buyer does not: the row cost in a gutter, the chips, the cost on the cell (a plain number while
  // editing, "Cost N" in the preview), the selected box with its struck "was <X>", a gone box, and a control on every
  // edge between neighbours (open "+" to join, joined, armed "×" to break — the legend F7 draws). Nothing here buys.
  // F-100 M10 (ruling f100-m10-editor-card R-M10E-4): the SAME branch draws a POWER's author model (powerToAuthorModel below) —
  // a cost per box (a box's own `cost`, else its row's), a box `span` columns wide (the columns it covers carry `filler`
  // cells, skipped here as the board skin skips them), an empty column as an "add here" slot when the model takes one
  // (`author.onSlot`), and, per the frames-card RIDER (item 6), ONE down-link per covered column: a wide box links to each
  // box under it at that box's column, never once at its centre. A specialization's model has span 1 everywhere and draws
  // exactly as before (data-down / data-right, the edge at the box's centre).
  if (model && model.author) {
    const A = model.author, edit = A.mode === 'edit';
    const out = [];
    const edgeName = (a, b) => (a && a.title) + ' and ' + (b && b.title);
    const anchorOf = (r, c) => {
      const cl = rows[r] && (rows[r].cells || [])[c];
      if (!cl) return null;
      return cl.filler ? ((rows[r].cells || [])[cl.anchor] || null) : cl;
    };
    // a column's centre inside a box `span` wide, as a CSS length (the board's column gap is 20px, paper.css .hp-tree)
    const colAt = (j, span) => span > 1 ? 'calc((100% + 20px) * ' + ((2 * j + 1) / (2 * span)) + ' - 10px)' : null;
    const edge = (cell, other, dir, at, left) => {
      const joined = !!(dir === 'right' ? (cell.right && other.left) : (cell.down && other.up));
      const half = !joined && !!(dir === 'right' ? (cell.right || other.left) : (cell.down || other.up));
      const ek = cell.key + ':' + dir + (at != null ? ':' + at : ''), armed = A.armed === ek;
      const state = armed ? 'armed' : joined ? 'joined' : 'open';
      return (
        <button type="button" key={'e' + dir + (at != null ? at : '')} className="hp-edge" data-edge={dir} data-edge-state={state} data-edge-half={half ? '1' : undefined}
          data-testid={'tree-edge-' + ek} style={left ? { left: 'calc(' + left + ' - 22px)' } : undefined}
          aria-label={(armed ? 'Tap again to break the link between ' : joined ? 'Break the link between ' : 'Join ') + edgeName(cell, other)}
          onClick={() => A.onEdge && A.onEdge(cell.row, cell.col, dir, at)}>
          <span className="hp-edge-mk" aria-hidden="true">{armed ? '×' : joined ? '' : '+'}</span>
        </button>
      );
    };
    rows.forEach((row, ri) => {
      out.push(<div className="hp-gutter" key={'g' + ri} aria-hidden="true"><span>{row.cost != null ? row.cost + ' xp' : ''}</span></div>);
      (row.cells || []).forEach((cell, ci) => {
        if (cell && cell.filler) return;
        if (!cell) {
          out.push(edit && A.onSlot
            ? <button type="button" key={'x' + ri + ci} className="hp-slot" data-author-slot={ri + '-' + ci} data-testid={'tree-slot-' + ri + '-' + ci}
                onClick={() => A.onSlot(ri, ci)}><span>{A.slotLabel || '+'}</span></button>
            : <div key={'x' + ri + ci} />);
          return;
        }
        const span = Math.max(1, cell.span || 1), cost = cell.cost != null ? cell.cost : row.cost;
        const downs = [];
        if (ri < rows.length - 1) for (let k = ci; k < ci + span && k < cols; k++) { const b = anchorOf(ri + 1, k); if (b) downs.push({ k, b }); }
        const right = ci + span < cols ? anchorOf(ri, ci + span) : null;
        const linkRight = !!(cell.right && right && right.left);
        const wideDown = span > 1;
        const linkDown = !wideDown && !!(downs[0] && cell.down && downs[0].b.up);
        const press = () => { if (edit) { if (A.onPick) A.onPick(cell.row, cell.col); } else { setSelKey(cell.key); if (onInspect) onInspect(cell.entry); else setDetail(cell.entry); } };
        const label = cell.gone && edit ? (A.goneLabel || 'Deleted talent — pick another') : cell.title;
        const noun = A.noun || 'talent';
        out.push(
          <div className="hp-tal" key={cell.key} data-role="author" data-author-cell={cell.key} data-testid={'talent-cell-' + cell.key}
            data-talent-name={cell.title} data-gone={cell.gone ? '1' : undefined} data-span={span > 1 ? String(span) : undefined}
            data-selected={(edit ? cell.selected : selKey === cell.key) ? '1' : undefined}
            data-down={linkDown ? '1' : undefined} data-right={linkRight ? '1' : undefined}
            style={span > 1 ? { gridColumn: 'span ' + span } : undefined}>
            <button type="button" className="hp-head" data-state="passive"
              aria-label={(edit ? 'Box ' + (ri + 1) + '-' + (ci + 1) + ': ' + label + '. Pick ' + (noun === 'talent' ? 'a talent' : 'an ' + noun) + ' for this box' : label + ' — ' + cost + ' XP')}
              onClick={press}>
              <span className="hp-name">{label}</span>
            </button>
            <div className="hp-plate hp-tal-body">
              {cell.gone ? null : <div className="hp-chips">{(cell.chips || []).map((c) => <span key={c} className="ed-chip" data-chip={c}>{c}</span>)}</div>}
              {cell.was ? <div className="hp-was">{'was ' + cell.was}</div> : null}
              {cell.gone ? null : <span className="hp-tab" data-tab={edit ? 'author' : 'preview'}>{edit ? String(cost) : 'Cost ' + cost}</span>}
            </div>
            {wideDown ? downs.filter((d) => cell.down && d.b.up).map((d) => <span key={'dl' + d.k} className="hp-dlink" aria-hidden="true" style={{ left: 'calc(' + colAt(d.k - ci, span) + ' - 2px)' }} />) : null}
            {edit && right ? edge(cell, right, 'right') : null}
            {edit ? (wideDown ? downs.map((d) => edge(cell, d.b, 'down', d.k, colAt(d.k - ci, span))) : (downs[0] ? edge(cell, downs[0].b, 'down') : null)) : null}
          </div>
        );
      });
    });
    const board = <div className={'hp-tree ' + (model.treeClass || '')} data-tree-skin="board" data-author={A.mode}>{out}</div>;
    if (!detail) return board;
    return (<React.Fragment>{board}<DirectionalTreeSheet entry={detail} accent={accent} onClose={() => setDetail(null)} paper /></React.Fragment>);
  }

  if (model && model.skin === 'board') {
    const interactive = model.interactive !== false;
    const cells = [];
    rows.forEach((row, ri) => (row.cells || []).forEach((cell, ci) => {
      if (!cell || cell.filler) return;
      const below = ri < rows.length - 1 && rows[ri + 1] && (rows[ri + 1].cells || [])[ci];
      const right = ci < cols - 1 && (row.cells || [])[ci + 1];
      const linkDown = !!(cell.down && below && below.up);
      const linkRight = !!(cell.right && right && right.left && !right.filler);
      const owned = isOwned(cell);
      const activation = cell.activation === 'active' ? 'active' : 'passive';
      // B-451/B-452 — THE BOARD'S CELL VOCABULARY at pin 5763dc2c, read from the re-pulled
      // fixtures rather than from a transcription (`board_talents_*`, `board_force_*`).
      //
      // REACH IS PREREQUISITE, NEVER AFFORDABILITY (`lab-laps-adoption` A4-1). It projects the
      // model's own `state`, which comes from `fcTalentIsAvailable` — the tree's links and the
      // owned set, and nothing about money. The model ALSO carries `buyState`, which folds in
      // affordability ('needxp'): reading reach off THAT would draw a cell you merely cannot
      // afford as unreachable, which is the confusion A4-1 exists to forbid. Affordability is the
      // refusal on press (B-440's register), not a state of the tree.
      //
      // `free` COUNTS AS BOUGHT. A cross-free talent is one the character HAS ('FREE · KNOWN'),
      // `fcTalentIsConnected` already treats it as connected so the tree links through it, and the
      // read tree's own legend says "a filled box is owned". It drew an EMPTY box before this
      // change, which said the opposite of all three.
      // WHICH TREE, NOT WHETHER IT IS PRESSABLE. The board draws the talents AND specialization
      // trees as `data-role="buy"` — 20 cells each — and only the Force tree as `data-role="read"`
      // (15). The specialization step shows a READ-ONLY PREVIEW OF THE BUY TREE, so keying this to
      // `interactive` gets it wrong there: it cost two fixtures (`board_spec_1366`/`_1920`, dom
      // parity 30 -> 32) before this measurement replaced the guess. `hp-forcetree` is the same
      // discriminator the legend uses, so the two cannot drift apart.
      //
      // REACHABLE EXISTS ONLY ON THE BUY TREE. Read-tree cells are ONLY bought (8) or locked (149)
      // across every fixture at this pin — never reachable — which is A5-2's word split in the
      // markup: a read-only tree with a middle state would promise a purchase on a screen that
      // carries no buy word.
      // R-M13B-158 (HOTFIX f100-m13-force-removal): a Force model that sets `buyOnCell` (Modify's alone) is a buy tree.
      const readTree = model.treeClass === 'hp-forcetree' && !model.buyOnCell;
      const reach = (cell.state === 'owned' || cell.state === 'granted' || cell.state === 'free')
        ? 'bought'
        : (!readTree && cell.state === 'available') ? 'reachable' : 'locked';
      const span = Math.max(1, cell.span || 1);
      // ONE CONTROL PER CELL PER BAND (B-506 R-TCB-A6-1 + `build-phone-talents` A1 R-BPT-A1-1,
      // which settled the fork these two rulings made when they met in this ONE shared renderer).
      //   DESKTOP (`pressOnHead` false) — B-506's shape exactly: `button.hp-tab > span.hp-tab-paint`
      //     is the sole control; the container AND the head carry nothing. Jason: "The purchasing
      //     should be in the cell itself … the cost on the cell should be the buy/refund button."
      //   PHONE (`pressOnHead` true) — the `.hp-head` is the control and opens the sheet; the badge
      //     is the READ chip there, never a button, which is what `board_talents_phone` draws.
      //   READ-role models — the chip and no control, on every band (C-3).
      // WHAT THIS REMOVED, and why the removal is the point: 111 cells claimed `role="button"` while
      // carrying none of the semantics — no accessible name for the action, no Enter/Space, and a
      // control inside a control the moment a real button landed in one. A cell that is not
      // pressable does not say it is.
      // THE CONTAINER CARRIES NO `onClick` ON ANY BAND. This lap arrived with "the click stays on
      // the container either way" as a contract; A1 RETIRED it rather than let it survive the merge
      // unexamined, so there is no `press` here and a tap on the cell BODY opens nothing. Drivers
      // press `.hp-head[role=button]` at 390 and `button.hp-tab` on desktop.
      const cellLabel = cell.title + ' — ' + cell.statusLabel + (cell.needsChoice ? ' — needs its skills chosen' : '');
      // (a) VARIANT, for Architect UI's render (paper-verify C10): at a band whose badge buys, a cell whose badge has NO
      // action (the READ-role Force tree; an owned choice talent still owing its skills) takes the phone's head press.
      // F-100 M7 W4 (R-M7G-23, -24): at a band whose badge buys, an owned cell carrying a characteristic pick takes the head
      // press too, and the consumer's `onHeadPick` opens W4's "chosen" panel beside it (the phone's sheet carries the
      // receipt); an owned swap with no pick opens the one picker from its head on every band (choose in place).
      const pickHead = !!(onHeadPick && cell.entry && (cell.entry.charChoiceReceipt || cell.entry.charChoiceNeeded || cell.entry.m8Pick));
      const pickFirst = pickHead && (!headPress || cell.entry.charChoiceNeeded || !!cell.entry.m8Pick);   // the phone's sheet carries the receipt; an M8 pick opens the picker
      const pressBase = !!(interactive && (headPress || (headPressWhereNoBadge && (readTree || cell.needsChoice))));
      // B-1033 (3) (ruling release-r7-bug-burndown ADDENDUM 199; the approved record is `talent-choice-picker`'s picker
      // frames at lab 4582d484, "Chosen, and bound"): at a band whose badge buys, an owned choice talent WITH its skills
      // takes the head press too, as M7's characteristic receipt does, and the press opens the tap sheet that carries
      // the receipt (CAREER SKILLS CHOSEN). The badge keeps its face.
      const receiptHead = !!(interactive && headPressWhereNoBadge && cell.entry && cell.entry.choiceReceipt && cell.entry.choiceReceipt.length);
      const pressOnHead = pressBase || !!(interactive && pickHead) || receiptHead;   // the badge keeps its face: tabFace reads pressBase
      // ORDER MATTERS: the band decides the badge, so `pressOnHead` is known before the face is
      // chosen. `board_talents_phone` at pin 6051229c draws 20 `div.hp-head[role=button]`, 20
      // `span.hp-tab`, 20 `span.hp-tab-key` and ZERO `button.hp-tab` — counted on the fixture, which
      // is the authority parity is measured against.
      // U10: a gone box is muted and dashed, carries no badge, and its HEAD opens its tap sheet on every band.
      if (cell.gone) {
        cells.push(
          <div className="hp-tal" key={cell.key} data-role="buy" data-reach="locked" data-gone="1"
            data-testid={'talent-cell-' + cell.key} data-talent-name={cell.title} data-talent-state="gone"
            data-down={linkDown ? '1' : undefined} data-right={linkRight ? '1' : undefined}
            data-owned={owned ? '1' : undefined} data-selected={selKey === cell.key ? '1' : undefined}
            style={Object.assign({ opacity: 0.72 }, span > 1 ? { gridColumn: 'span ' + span } : {})}>
            <div className="hp-head" data-state="passive" style={{ background: 'var(--doc-rule, #d9d6cc)', color: 'var(--doc-ink-muted, #5d5a52)' }}
              role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
              aria-label={interactive ? (cell.title + ' — box ' + (ri + 1) + '-' + (ci + 1)) : undefined}
              onKeyDown={interactive ? ((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(cell); } }) : undefined}
              onClick={interactive ? (() => tap(cell)) : undefined}>
              {owned ? <span className="hp-box" data-on="1" /> : null}
              <span className="hp-name">{cell.title}</span>
            </div>
            <div className="hp-plate hp-tal-body" style={{ borderStyle: 'dashed', background: 'transparent' }} />
          </div>
        );
        return;
      }
      const face = tabFace(cell, readTree, pressBase);
      cells.push(
        <div className="hp-tal" key={cell.key}
          data-role={readTree ? 'read' : 'buy'} data-reach={reach}
          data-testid={'talent-cell-' + cell.key} data-talent-name={cell.title} data-talent-state={cell.state}
          data-down={linkDown ? '1' : undefined} data-right={linkRight ? '1' : undefined}
          data-owned={owned ? '1' : undefined} data-needs-choice={cell.needsChoice ? '1' : undefined}
          data-selected={selKey === cell.key ? '1' : undefined}
          data-refusing={refusingKey === cell.key ? '1' : undefined}
          style={span > 1 ? { gridColumn: 'span ' + span } : undefined}>
          <div className="hp-head" data-state={activation}
            role={pressOnHead ? 'button' : undefined} tabIndex={pressOnHead ? 0 : undefined}
            aria-label={pressOnHead ? cellLabel : undefined}
            onKeyDown={pressOnHead ? ((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (pickFirst) onHeadPick(cell.entry, e.currentTarget); else tap(cell); } }) : undefined}
            /* A1: the head OPENS THE SHEET on the phone. The lap shipped the keyboard half here and
               left the pointer half on the container; A1 retired the container's click, so without
               this line a phone tap would open nothing at all — the head would announce itself as a
               button and do nothing when pressed, which is worse than either shape alone. */
            onClick={pressOnHead ? ((e) => { if (pickFirst) onHeadPick(cell.entry, e.currentTarget); else tap(cell); }) : undefined}>
            {/* THE MARK IS FILLED / EMPTY / ABSENT, and ABSENT is a state the app did not have.
                The board draws NO box on a locked cell — 306 of them in the buy frames and 149 in
                the read frames, measured across every tree fixture at this pin — while a bought
                cell carries `data-on="1"` and a reachable one `data-on="0"`. Rendering an empty
                box on a locked cell said "reachable, not yet taken" for a node whose prerequisite
                is unmet. `data-state` stays the talent's ACTIVATION and is untouched: the same
                measurement shows locked cells both active (88) and passive (218), so it never
                tracked reach and must not be made to. */}
            {reach !== 'locked'
              ? <span className="hp-box" data-on={reach === 'bought' ? '1' : '0'} />
              : null}
            <span className="hp-name">{cell.title}</span>
          </div>
          <div className="hp-plate hp-tal-body">
            {/* SIZE 1 — the glyph INHERITS the prose here, as the board's does (the spec preview's note). A model built
                with `cssSized` (the creator's trees, B-1600) leaves the glyph's box to the ground's stylesheet. */}
            {cell.entry && cell.entry.cellCite != null
              ? <p>{cell.entry.cellCite ? <span data-s1="cell" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: 1.45, color: 'var(--doc-ink-muted)' }}>{cell.entry.cellCite}</span> : null}</p>
              : <p>{glyphs(cleanMarkup((cell.entry && (cell.entry.descShort || cell.entry.desc)) || ''), 1, model.cssSized ? { cssSized: true } : undefined)}</p>}
            {face.press ? (
              /* THE ONE CONTROL. A real <button>: Enter and Space come free, Tab order is the tree's
                 reading order because nothing reorders it, and the accessible name says the action
                 and the talent. `hp-tab` keeps the board's class so the board's own rules still
                 reach it; `data-tab` carries the state the paint keys off. */
              /* THE BOARD'S OWN TWO-PART SHAPE, adopted rather than invented: `button.hp-tab >
                 span.hp-tab-paint`. The BUTTON is the hit target (44px, AS-6) and the SPAN is the
                 painted badge, so the target grows without the paint growing — the same end this
                 seat first reached with a transparent border, but said the way the drawing says it.
                 Found by parity against the lab's catch-up pin, which is what parity is for. */
              <button type="button" className="hp-tab" data-state={activation} data-tab={face.kind}
                data-tal-act={cell.key} aria-label={face.aria} onClick={face.press}>
                <span className="hp-tab-paint">{face.label}</span>
              </button>
            ) : (
              /* A READ-ROLE CELL KEEPS THE BOARD'S COST CHIP (C-3). The two-part badge is the BUY
                 role's shape — the button is the 44px target and the span is the paint — and a tree
                 with nothing to buy has no target to grow. Wrapping the chip in `hp-tab-paint`
                 anyway is what put all ten `board_force_*` frames red: the app drew
                 `span.hp-tab > span.hp-tab-paint > span.hp-tab-key` where the board draws
                 `span.hp-tab > span.hp-tab-key`. `face.press` is already null on this branch, so no
                 buy affordance is reachable on a read tree. */
              <span className="hp-tab" data-state={activation} data-tab={face.kind}>
                {face.keyed ? face.label : <span className="hp-tab-paint">{face.label}</span>}
              </span>
            )}
          </div>
          {refusingKey === cell.key ? (
            /* THE REFUSAL, over a dimmed cell (Jason 2026-09-09). `role="status"` announces it when
               it appears — the reason a refused purchase gives is no use to a screen reader if it
               only paints. Escape dismisses (the handler is on the component). */
            /* THE CLOSE BUTTON RETIRED (R-CRG-A3-2 (3)). Neither the approved page
               (`talents-cell-buy.html` frames 4-5, `div.tc-refuse > span` and nothing else) nor the
               lab board draws a button here, and the pointer dismissal it carried now lives on the
               badge that opened the refusal. Nothing was removed from the a11y floor: Escape
               dismisses, the badge dismisses, and `role="status"` still announces.
               THE HOME AND THE WRAPPER ARE NOT CHANGED HERE, and that is a HALT, not an omission —
               the approved page draws this object as a SIBLING of the body in a full-cell overlay
               (`.tc-refuse{position:absolute;inset:0}`) and the lab board at 02f95b78 draws it
               INSIDE the body as a bottom strip; the two records disagree and C-MU-4 / R-MIL-2
               makes that Jason's. Gate `tree-cell-refusal-home` carries both renderings. */
            /* AND THE OVERLAY ITSELF IS THE POINTER DISMISSAL, because the badge cannot be the
                one while the overlay is full-cell. R-CRG-A3-2 (3) ruled "pressing the refused badge
                again dismisses", and the toggle IS wired — but this plate is `position:absolute;
                inset:0` over the cell, so it intercepts pointer events and a REAL click on the
                badge never lands (Playwright: "div.hp-refuse intercepts pointer events", 30s of
                retries). A toggle reachable only by a dispatched `.click()` is B-533's class exactly
                — reachable, 44px, and unpressable — so the route a finger can actually take is a
                press on the reason, which invents no drawn object and is the gesture an overlay
                already implies. Escape stays the keyboard route and `role="status"` still announces.
                If Jason takes the board's low strip instead of this overlay, the badge stops being
                covered and the ruled badge-toggle works literally; both are wired, so neither
                answer needs new code here. */
            <div className="hp-refuse" role="status" data-tal-refused={(cell.entry && cell.entry.buy && cell.entry.buy.state) || 'locked'}
              data-tal-refuse-dismiss="1" onClick={() => setRefusingKey(null)}>
              <span>{refusalText(cell)}</span>
            </div>
          ) : null}
        </div>
      );
    }));
    /* THE READ TREE'S LEGEND (`lab-laps-adoption` A5-2 / A7-2, §77.7), a SIBLING of the tree as
       the board draws it, and READ-ONLY: the board's force frames carry it once and its talents
       frames carry it zero times, measured. The words are the user's half of the split — the buy
       tree says reachable · bought · locked through its marks, the read tree says owned · not
       owned and uses NO buy word. The attribute underneath still reads `data-reach="locked"` on
       an unowned cell, which is the board's own vocabulary and what parity compares; A6-2 says do
       not "fix" it to match the caption. Verbatim from the board at pin 5763dc2c — this wording
       is what changed in the eight force frames the refresh re-pulled, so it is transplanted
       rather than remembered. */
    const tree = (
      <div className={'hp-tree' + (model.treeClass ? ' ' + model.treeClass : '')} data-tree-skin="board">
        {cells}
      </div>
    );
    /* SCOPED BY MEASUREMENT, NOT BY INTERACTIVITY — corrected here after the first cut keyed it to
       `interactive` and put the legend under the SPECIALIZATION step's preview too, which the
       board does not draw (dom parity 30 -> 32, `board_spec_1366`/`_1920`, caught by the suite
       before it left the lap). Counted at pin 5763dc2c: `hp-treekey` appears once in every force
       frame, ZERO times in the talents frames and ZERO in the spec frames. It is the FORCE tree's
       legend, so the force tree is what asks for it. */
    /* THE SHEET IS THE BOARD SKIN'S TOO, WHEN NOBODY ELSE TAKES THE PRESS (R-PTC-3 / R-TCB-A1-1).
       Every desktop consumer passes `onInspect` and draws the pressed cell in its own pane, so this
       branch only ever returned the tree — and the PHONE, which passes no `onInspect`, set `detail`
       on each press and rendered nothing. The default skin below has always mounted the sheet on
       exactly this condition; the board skin now does the same, so the ONE component keeps ONE
       press contract across both skins. THE RESTING DOM IS UNTOUCHED: with no `detail` this still
       returns the bare tree (plus the variant marker below, when there is one), which is what DOM and
       style parity compare. */
    /* B-993 WAY (a) — THE VARIANT MARKER ON THE PAPER TREE (ruling `f100-m6-pack` R-M6G-26/27; Jason's
       pick, ADDENDUM 7; frames A1/A2). A tree built from a reSpecialized pack says so where it is read:
       the pack's own label (the manifest's `label`, the same `_variant.label` the default skin below
       draws) in the paper kit's citation chip, above the tree. Both faces' paper trees load this one
       component — the creator's talent step, Growth → New Specialization's preview, Advancement — so the
       marker lives here once. It adds ONE element to the resting DOM of a variant tree
       (smoke_board_dom_parity, R-M6G-24); a base tree's DOM is unchanged. */
    const marked = (model && model._variant)
      ? <React.Fragment><div className="hp-variant" data-variant-marker="1" style={{ display: 'flex', margin: '0 0 10px' }}><span className="hp-cite">{model._variant.label}</span></div>{tree}</React.Fragment>
      : tree;
    if (!detail) return marked;
    return (
      <React.Fragment>
        {marked}
        <DirectionalTreeSheet entry={detail} accent={accent} onClose={() => setDetail(null)} paper />
      </React.Fragment>
    );
  }

  return (
    <div style={{ padding: '0 12px 24px' }}>
      {/* F-9 legibility (respec-visibility-triage): the variant marker — the first visible proof-of-life
          that a rebuilt tree is active. Renders on every DirectionalTree surface (creator, spec preview,
          ADVANCEMENT) whenever the resolved spec carries _variant (toggle view OR a stamped sheet).
          Just the variant name (Jason 2026-07-24), uppercased by textTransform. */}
      {model && model._variant && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.12em',
            textTransform: 'uppercase', color: accent, background: accent + '18',
            border: '1px solid ' + accent + '44', borderRadius: '4px', padding: '3px 9px',
          }}>{model._variant.label}</span>
        </div>
      )}
      <div style={{ position: 'relative', width: (gridW + labelW) + 'px', margin: '0 auto' }}>
        <div data-tour-id={model && model.gutterTourId} style={{ position: 'absolute', left: 0, top: 0, width: labelW, height: gridH, zIndex: 0 }}>
          {rows.map((row, ri) => (
            <div key={ri} style={{ position: 'absolute', left: 0, top: ri * (cellH + gap), width: labelW, height: cellH, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid ' + accent + '22', gap: '2px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.18em', color: accent, fontWeight: 700 }}>R{ri + 1}</div>
              {row.cost != null && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.1em', color: accent + 'BB' }}>{row.cost}XP</div>}
              {/* B-84: the cheapest legal XP to reach INTO this row. Printed only where it differs
                  from the row price — on row 1 they are the same and a second identical number
                  would be noise. This is the number the screen could not previously express: an
                  identical grid with identical row prices reaches its bottom row for 75 XP in 100
                  trees and 110 in two, and only the links differ. */}
              {row.reach != null && row.cost != null && row.reach > row.cost && (
                <div data-row-reach={row.reach} title={'Cheapest legal path into row ' + (ri + 1)} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.55)' }}>{'↓' + row.reach}</div>
              )}
            </div>
          ))}
        </div>
        <div style={{ position: 'relative', width: gridW, marginLeft: labelW }}>
          <svg style={{ position: 'absolute', top: 0, left: 0, width: gridW, height: gridH, pointerEvents: 'none', zIndex: 0 }}>
            <defs><filter id="dtLineGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.5" result="dtb" /><feMerge><feMergeNode in="dtb" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
            {lines.map(l => <line key={l.k} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.active ? accent : 'rgba(255,255,255,0.55)'} strokeWidth={l.active ? 3 : 2.5} filter={l.active ? 'url(#dtLineGlow)' : undefined} />)}
          </svg>
          {rows.map((row, ri) => (row.cells || []).map((cell, ci) => {
            if (!cell || cell.filler) return null;
            const span = Math.max(1, cell.span || 1);
            const widthPx = span * cellW + (span - 1) * gap;
            const selected = selKey === cell.key;
            const s = dtCellSkin(accent, cell.state);
            const titleSize = span >= 3 ? 12 : (span === 2 ? 11 : 9);
            return (
              <button key={cell.key} type="button" data-tour-id={cell.tourId} data-needs-choice={cell.needsChoice ? '1' : undefined}
                /* B-248: the testid surface. Inert attributes — nothing about behaviour moves.
                   Suites drove these cells by scanning every button for matching TEXT, which is
                   the B-209 shape: it needs a JS click and it silently matches the wrong node when
                   two talents share a word. Addressable by grid position AND by talent name. */
                data-testid={'talent-cell-' + cell.key} data-talent-name={cell.title} data-talent-state={cell.state}
                onClick={() => tap(cell)} aria-label={cell.title + ' — ' + cell.statusLabel + (cell.needsChoice ? ' — needs its skills chosen' : '')} style={{
                position: 'absolute', left: ci * (cellW + gap), top: ri * (cellH + gap), width: widthPx, height: cellH,
                // B-181: an owned choice-talent still missing its skills wears a caution border + glow so
                // the prompt is visible ON the tree, not only after a tap (R-TCLM-2; mockup frame 8).
                background: s.bg, border: '1px solid ' + (selected ? accent : (cell.needsChoice ? 'var(--text-caution)' : s.borderCol)),
                outline: selected ? '1px solid ' + accent + 'AA' : 'none', outlineOffset: '1px',
                boxShadow: selected ? '0 0 14px ' + accent + '88' : (cell.needsChoice ? '0 0 14px -3px rgba(255,200,87,0.6)' : s.cellShadow), borderRadius: '7px',
                cursor: 'pointer', zIndex: 1, padding: '4px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s', touchAction: 'manipulation',
              }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: titleSize + 'px', fontWeight: 700, color: s.textCol, textAlign: 'center', lineHeight: 1.15, letterSpacing: span >= 2 ? '0.02em' : '-0.02em', wordBreak: 'break-word', padding: '0 2px' }}>{cell.title}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-2xs)', color: s.statusCol, marginTop: '4px', letterSpacing: '0.08em' }}>{cell.statusLabel}</div>
                {cell.ownedDot && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: accent, marginTop: '3px' }} />}
                {cell.needsChoice && <div aria-hidden="true" style={{ position: 'absolute', top: '3px', right: '4px', minWidth: '16px', height: '16px', padding: '0 3px', borderRadius: '8px', background: 'var(--text-caution)', color: '#1a1400', fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '11px', lineHeight: '16px', textAlign: 'center', boxShadow: '0 0 10px -2px rgba(255,200,87,0.7)' }}>!</div>}
              </button>
            );
          }))}
          <div style={{ height: gridH }} />
        </div>
      </div>
      {detail && <DirectionalTreeSheet entry={detail} accent={accent} onClose={() => setDetail(null)} />}
    </div>
  );
}

// ADAPTER: talent tree → normalized model. Owns all talent-domain knowledge; the buy/refund thunks close
// over the call-site's spines (onBuy handles the Dedication picker itself — coverage pin C stays here).

function talentTreeToModel({ specData, talentDb, character, goneRemoved, crossFreeIds, allowRefund, readOnly, availableXp, onBuy, onRefund, talentSkillChoices, skillNames, onChooseSkills, skin, interactive, heldReason, characteristicChoices, talentChoices, characteristicOwed, cssSized }) {
  // B-84: cheapest legal XP to OWN each cell — computed ONCE per model, read by the gutter and
  // by each cell's entry. See fcTalentReachCosts for why this is a shortest path, not a row sum.
  const tree = specData.talent_tree || [];
  const specKey = specData.id;
  // F-100 M8 (ruling `f100-m8-build` R-M8G-4): the tree reads every pick through THE ONE READER, CharResolve.pickOf —
  // M8's `talentChoices` first, then the legacy map under its own pick id (R-M8G-3). Nothing here indexes a pick map.
  const pickRecord = { talentSkillChoices, talentCharacteristicChoices: characteristicChoices, talentChoices };
  const pickAt = (pos, pickId) => (window.CharResolve && CharResolve.pickOf) ? CharResolve.pickOf(pickRecord, specKey, pos, pickId) : undefined;
  const talents = character.talents || {};
  const _reach = fcTalentReachCosts(tree, crossFreeIds);
  // The cheapest reach INTO each row — the gutter's ↓n. It is the minimum over that row's cells,
  // and it can be strictly less than the cheapest cell a player would actually want.
  const _rowReach = tree.map((row, ri) => {
    let best = null;
    (row.talents || []).forEach((cell, ci) => {
      if (!cell) return;
      const v = _reach[ri + ',' + ci];
      if (v != null && (best == null || v < best)) best = v;
    });
    return best;
  });
  const rows = tree.map((row, ri) => ({
    cost: row.cost,
    reach: _rowReach[ri],
    cells: (row.talents || []).map((cell, ci) => {
      if (!cell) return null;
      // F-100 M5 U10 (ruling f100-m5-contracts §5; C2.5): a box whose talent is GONE from the view — an own talent deleted
      // after a copied tree named it. It printed the raw id (M-4); it now reads "Deleted talent", muted, with no chips and
      // nothing to buy, and its tap says why. An owned position keeps its mark: ownership is a fact about the character.
      // B-1595 (D-412 item 1, ADDENDUM 306): a talent whose collection was REMOVED from the character, not deleted — the
      // caller's `goneRemoved(id)` is THE ONE PREDICATE (CharResolve.removedRef) → null | { name } — reads the device copy's
      // name, else "Removed talent" (page 2 §1, as drawn). Only the box's name moves.
      if (!(talentDb && Object.prototype.hasOwnProperty.call(talentDb, cell.talent))) {
        const goneOwned = fcTalentIsPurchased(specKey, ri, ci, talents), gl = cell.links || {};
        const rm = typeof goneRemoved === 'function' ? goneRemoved(cell.talent) : null;
        const goneTitle = rm ? (rm.name || 'Removed talent') : 'Deleted talent';
        return {
          key: ri + '-' + ci, title: goneTitle, statusLabel: goneTitle, state: goneOwned ? 'owned' : 'locked', gone: true,
          up: !!gl.up, down: !!gl.down, left: !!gl.left, right: !!gl.right, span: 1, filler: false, ownedDot: goneOwned && ri > 0,
          cost: null, activation: 'passive',
          entry: { cellId: specKey + '_r' + ri + 'c' + ci, talentKey: cell.talent, specKey: specKey, row: ri, col: ci, gone: true,
                   name: goneTitle, meta: 'Box ' + (ri + 1) + '-' + (ci + 1), desc: 'This talent was deleted from your homebrew.',
                   activationLine: 'BOX ' + (ri + 1) + '-' + (ci + 1), buy: null, refund: null },
        };
      }
      const info = talentDb[cell.talent] || {};
      const isPurchased = fcTalentIsPurchased(specKey, ri, ci, talents);
      const isAvailable = fcTalentIsAvailable(specKey, ri, ci, tree, talents, crossFreeIds);
      const isCrossFree = !isPurchased && crossFreeIds && crossFreeIds.indexOf(cell.talent) !== -1;
      const ranked = !!info.ranked;
      const cost = isCrossFree ? 0 : row.cost;
      const state = isPurchased ? 'owned' : isCrossFree ? 'free' : isAvailable ? 'available' : 'locked';
      const statusLabel = isCrossFree ? 'FREE · KNOWN' : (row.cost + ' XP' + (ranked ? ' · RANKED' : ''));
      const links = cell.links || {};
      const canRefund = !readOnly && allowRefund !== false && isPurchased && fcTalentIsRefundable(specKey, ri, ci, tree, talents, crossFreeIds);
      const buyState = isPurchased ? 'owned' : isCrossFree ? 'free' : isAvailable ? ((availableXp != null && cost > availableXp) ? 'needxp' : 'buyable') : 'locked';
      // B-181: choice-talents (Well Rounded / Well Read) carry a per-rank skill choice. The picker is
      // raised by the mount's onBuy interception; the model surfaces WHICH cells are choice-talents,
      // which OWNED ones still need their skills (the legacy-migration prompt — ruling …-migration §8),
      // and the chosen skills' names for the receipt. Detection is registry-only (talentChoiceGrantsOf),
      // never talent-name-keyed. Absent choices stay graceful — no entry ⇒ no receipt, today's shape.
      const choiceGrants = (window.CharResolve && CharResolve.talentChoiceGrantsOf(info)) || [];
      const isChoiceTalent = choiceGrants.length > 0;
      const choiceCount = choiceGrants.reduce((n, g) => n + (Number(g.count) || 0), 0);
      const picksHere = pickAt(ri + '-' + ci, 'career_skills') || null;
      const needsChoice = isChoiceTalent && isPurchased && !(picksHere && picksHere.length);
      const choiceReceipt = (isChoiceTalent && picksHere && picksHere.length && skillNames)
        ? picksHere.map(id => skillNames[id] || id) : null;
      // F-100 M7 W4 (ruling f100-m7-build R-M7G-23): THE characteristic-choice receipt, modelled on B-181's above — an
      // OWNED cell whose talent swaps a skill's characteristic to a CHOSEN one (C1's `skill_characteristic`, `to:
      // chosen`: Renegade Form), with the pick on record at the same address (`talentCharacteristicChoices[spec]["r-c"]`,
      // R-M7K-3). The words are W4's "chosen" frame (Docs/mockups/f100-m7-correct.html @ 0e35174f). No pick → no receipt.
      const charSwap = (info.effects || []).find(e => e && e.op === 'skill_characteristic' && e.to === 'chosen');
      const charPicked = (charSwap && isPurchased && characteristicChoices) ? (pickAt(ri + '-' + ci, 'characteristic') || null) : null;
      const charChoiceReceipt = (charPicked && typeof charPicked === 'string') ? (() => {
        const ch = charPicked.charAt(0).toUpperCase() + charPicked.slice(1);
        const sk = (Array.isArray(charSwap.skills) ? charSwap.skills : []).map(id => (skillNames && skillNames[id]) || id);
        return 'You chose ' + ch + '. ' + sk.join(' and ') + (sk.length > 1 ? ' roll' : ' rolls') + ' with ' + ch + ' while it is your best.';
      })() : null;
      // R-M7G-24 (D-13): an owned swap with NO pick (bought before M7, or in the creator) — its head opens the one picker
      // to choose in place, on every band, when the consumer passes `onHeadPick` and the record is passed at all.
      const charChoiceNeeded = !!(charSwap && isPurchased && characteristicChoices && !charPicked);
      // B-1055 (ADDENDUM 86): an owned Dedication still owed its characteristic (CharResolve.dedicationOwedCells, passed by
      // the consumer as `characteristicOwed`) opens the same one picker to place it — the +1 lands at the place.
      const dedicationOwed = !!(isPurchased && cell.talent === 'dedication' && Array.isArray(characteristicOwed)
        && characteristicOwed.indexOf(specKey + ' ' + ri + '-' + ci) !== -1);
      // F-100 M8 step 3 (frame R6; f100-m8-contracts R-M8K-27 R6): an OWNED cell whose talent declares a per-rank pick of a
      // skill or an item (Deadly Accuracy, Tinkerer) opens M7's ONE picker from its head, to choose — or choose again — in
      // place, no XP. The consumer decides what the picker offers; the model only says which pick the cell carries.
      // B-1054: a LEGACY pick id (R-M8G-3: Well Rounded's and Well Read's `career_skills`) is not M8's — pickWrite refuses
      // it, so M8's picker on that head dropped the choice silently; the cell keeps B-181's prompt and receipt instead.
      const legacyPick = (id) => !!(window.CharResolve && CharResolve.isLegacyPick && CharResolve.isLegacyPick(id));
      const m8Decl = isPurchased ? ['roll_numbers', 'item_effects', 'pool_mods', 'told'].reduce((found, k) => found
        || (Array.isArray(info[k]) ? info[k] : []).map(r => r && r.pick).find(p => p && p.per === 'rank' && (p.kind === 'skill' || p.kind === 'item') && !legacyPick(p.id)), null) : null;
      // Jury Rigged (frames J1–J3, D-59): a kind-option pick whose `for_item` is this item pick rides on the same cell, so the
      // one picker asks the item, then the improvement (f100-m8-contracts A3.2 (1))
      const m8Opt = m8Decl && m8Decl.kind === 'item' ? ['item_effects', 'told'].reduce((found, k) => found
        || (Array.isArray(info[k]) ? info[k] : []).map(r => r && r.pick).find(p => p && p.kind === 'option' && p.for_item === m8Decl.id), null) : null;
      const m8Pick = m8Decl ? { id: m8Decl.id, kind: m8Decl.kind, optionId: m8Opt ? m8Opt.id : null } : null;
      // Activation line (the retired FCTalentDetail's meta): "PASSIVE · RANKED · ROW N · cost XP" — the sheet
      // shows this so a tapped talent still reads as an action type, not just a price.
      // the local actMap retired onto the shared formatter (one home — SWRPGUI.formatActivation)
      const activationLine = (formatActivation(info.activation) || 'Passive').toUpperCase() + (ranked ? ' · RANKED' : '') + ' · ROW ' + (ri + 1) + ' · ' + row.cost + ' XP';
      // B-84: the ROUTE — what owning THIS cell actually costs, cheapest legal path included. Shown
      // only where it differs from the row price (row 1, and anything already owned, are the same).
      const reachCost = _reach ? _reach[ri + ',' + ci] : null;
      const activationWord = formatActivation(info.activation) || 'Passive';
      const reachLine = (!isPurchased && reachCost != null && reachCost > row.cost)
        ? ('CHEAPEST ROUTE TO OWN THIS: ' + reachCost + ' XP — the ' + row.cost
           + ' XP price is this row only, and a connected path must be bought first.')
        : null;
      return {
        key: ri + '-' + ci, title: info.name || cell.talent, statusLabel, state,
        tourId: (ri === 0 && ci === 0) ? 'p-custom-talents-cell' : undefined,
        up: !!links.up, down: !!links.down, left: !!links.left, right: !!links.right,
        span: 1, filler: false, ownedDot: isPurchased && ri > 0, needsChoice: needsChoice,
        // THE BOARD SKIN'S TWO FACTS (R-TTS-1): the cell's price and the board's two-state
        // activation — anything that is not PASSIVE is something the character DOES (the spec
        // preview's rule, kept). The default skin reads neither.
        cost: cost, activation: String(info.activation || 'passive') === 'passive' ? 'passive' : 'active',
        entry: {
          cellId: specKey + '_r' + ri + 'c' + ci, lockedHint: ri, activationLine, reachLine,
          // The board's pressed-cell block (4582d484): the activation WORD as the cite, the cheapest
          // route ALWAYS printed ("Cheapest route to this cell: N XP."), the talent's own id/key.
          activationWord: activationWord, reachCost: reachCost != null ? reachCost : row.cost,
          talentKey: cell.talent, specKey: specKey, row: ri, col: ci,
          cannotRefund: !readOnly && allowRefund !== false && isPurchased && !canRefund,
          isChoiceTalent: isChoiceTalent, choiceCount: choiceCount, needsChoice: needsChoice, choiceReceipt: choiceReceipt, charChoiceReceipt: charChoiceReceipt, charChoiceNeeded: charChoiceNeeded || dedicationOwed, m8Pick: m8Pick,
          choose: (needsChoice && !readOnly && onChooseSkills) ? { label: 'CHOOSE YOUR SKILLS', doChoose: () => onChooseSkills(cell.talent, specKey, ri, ci) } : null,
          // R-DT-2 (what buying does, per kind) + R-DT-3 (muted source cite where the registry carries it —
          // talents ship `sources`; never on app-authored prose). ruling directional-tree-build C1.
          buyingDoes: null,
          // B-336 talents wave: the STORED value is a vocabulary key now, so the cite must be
          // resolved rather than printed. `gameLineTitle` is the module-level resolver over
          // `SWRPGSources.sourceLabel` (:1682) — the one path, never a walk beside it — and it
          // returns its input unchanged for anything it cannot resolve, so an unconverted
          // registry reaching here still prints what it printed before.
          // S1 (argo-a1-curation ADDENDUM 4; F1/F9): in a copy without the book's words, the book line (pages from the
          // talent's own cites) stands in the cite slot; '' (no book) collapses it. holocron: removedLine is null, as before.
          sourceCite: ((s1) => (s1 != null ? (s1 || null) : (info.sources && info.sources.length) ? info.sources.map(gameLineTitle).join(' · ') : null))(
            window.SWRPGSources && window.SWRPGSources.removedLine ? window.SWRPGSources.removedLine(info) : null),
          // T1 (argo-a1-export ADDENDUM 6): the cell plate's ONE book carrying the page, in a copy without the book's words
          cellCite: window.SWRPGSources && window.SWRPGSources.removedCellLine ? window.SWRPGSources.removedCellLine(info) : null,
          name: info.name || cell.talent, meta: statusLabel, desc: info.description || (window.SWRPGSources && window.SWRPGSources.ruleText ? window.SWRPGSources.ruleText : () => null)('talents', cell.talent, 'description') || '',
          // B-855: a HELD sheet's unowned cells carry the hold's reason and no buy (the frame's "Held"); owned
          // cells stay owned. `heldReason` is the reason line's own text, so every held control says one thing.
          buy: readOnly ? null : (heldReason && !isPurchased) ? { state: 'held', cost, reason: heldReason }
            : { state: buyState, cost, label: 'BUY TALENT', doBuy: () => onBuy && onBuy(cell.talent, specKey, ri, ci, cost) },
          refund: (canRefund && !heldReason) ? { label: 'REFUND — +' + cost + ' XP', doRefund: () => onRefund && onRefund(specKey + '_r' + ri + 'c' + ci) } : null,
        },
      };
    }),
  }));
  // F-9 legibility: carry the (non-persisted) variant marker through to DirectionalTree's chip.
  // F-100 M12 (R-M12B-5, D-157 K-MK): the marker asks the ONE label path, SWRPGMods.variantOfRecord (a tree more than
  // one pack places reads plain "reSpecialized"); no second label path here.
  const MODS = typeof window !== 'undefined' ? window.SWRPGMods : null;
  const variant = (MODS && MODS.variantOfRecord) ? MODS.variantOfRecord(null, 'specializations', specData) : null;
  return { specKey, rows, gutterTourId: 'p-custom-talents-rows', _variant: variant,
           skin: skin || undefined, interactive: interactive, cssSized: cssSized || undefined };
}

// ADAPTER: Force-power upgrade tree → normalized model. Owns the Force-domain knowledge the Force
// renderer used to bundle: the spanning row-0 basic power (_span + filler cells — coverage pin B), the
// credit-consumption ownership synthesis (ranked upgrades across tiers), and the OWNED n/m rank counts
// (coverage pin A). Row 0 is granted (STARTING). `power` = { id, description, tree:[{cells:[…]}], abilities:{} }.
// `readOnly` (B-89) is the TALENT adapter's own idiom (":4354"), adopted rather than invented: it
// nulls `buy` so a cell teaches without offering a purchase. The creator needs it because upgrades
// are NOT buyable at creation — passing `availableXp: 0` instead would render every cell as
// "NOT ENOUGH XP", which is a different and untrue statement.

// `upgradeCost(abilityKey, printedCost)` (optional; B-1526): the cell's price — the sheet's advancement passes CharResolve's one
// upgrade price (the group Mentor's upgrade discount); absent, the printed cell.
function forcePowerToModel({ power, ownedUpgradeNames, ownedCells, availableXp, readOnly, onBuy, skin, interactive, basicOwned, upgradeCost, cssSized, buyOnCell }) {
  const COLS = 4;
  const specKey = 'fp_' + (power && power.id);
  const talents = {};
  const remainingCredits = [];
  (ownedUpgradeNames || []).forEach(n => { if (n) remainingCredits.push(String(n).toLowerCase()); });
  const tryConsume = (abKey, abName) => {
    const kl = (abKey || '').toLowerCase(), nl = (abName || '').toLowerCase();
    for (let i = 0; i < remainingCredits.length; i++) { if (remainingCredits[i] === kl || remainingCredits[i] === nl) { remainingCredits.splice(i, 1); return true; } }
    return false;
  };
  // Build the internal tree (cells carry .links for fcTalentIsAvailable) + synthesize ownership.
  const treeRows = [];
    // R7 B-1536 (ruling release-r7-bug-burndown ADDENDUM 271): a VALID `owned` (the entry's bought cells, 269's one check —
  // CharResolve.forcePowerOwnedProblems) badges each bought cell at ITS row-col; absent or mismatched, tree order as before.
  const CRt = typeof window !== 'undefined' ? window.CharResolve : null;
  const ownedAt = (Array.isArray(ownedCells) && ownedCells.length && CRt && CRt.forcePowerOwnedProblems
    && !CRt.forcePowerOwnedProblems({ upgrades: (ownedUpgradeNames || []).map(n => String(n).toLowerCase()), owned: ownedCells }, (power && power.tree) || []).length)
    ? new Set(ownedCells) : null;
((power && power.tree) || []).forEach((row, ri) => {
    const cells = [null, null, null, null];
    (row.cells || []).forEach(c => {
      if (!c || c.col == null || !c.ability) return;
      const span = Math.max(1, c.span || 1); const L = c.links || {};
      cells[c.col] = { _abilityKey: c.ability, _cost: upgradeCost ? upgradeCost(c.ability, c.cost || 0) : (c.cost || 0), _span: span, filler: false, up: !!L.up, down: !!L.down, left: !!L.left, right: !!L.right, links: { up: !!L.up, down: !!L.down, left: !!L.left, right: !!L.right } };
      for (let fi = c.col + 1; fi < Math.min(COLS, c.col + span); fi++) {
        cells[fi] = { _abilityKey: c.ability, _cost: upgradeCost ? upgradeCost(c.ability, c.cost || 0) : (c.cost || 0), _span: 0, filler: true, up: !!L.up, down: !!L.down, left: false, right: false, links: { up: !!L.up, down: !!L.down, left: false, right: false } };
      }
    });
    treeRows.push({ talents: cells });
    cells.forEach((cell, ci) => {
      if (!cell || cell.filler) return;
      let owned = false;
      if (ri === 0) owned = true;
      else if (ownedAt) owned = ownedAt.has(ri + '-' + ci);
      else { const abInfo = ((power.abilities || {})[cell._abilityKey]) || {}; if (tryConsume(cell._abilityKey, abInfo.name || cell._abilityKey)) owned = true; }
      // R-M13B-161: an anchor's entry carries its specKey, so the talents' fcTalentIsRefundable reads Force cells
      if (owned) talents[specKey + '_r' + ri + 'c' + ci] = { row: ri, col: ci, specKey };
    });
    let lastAnchor = -1;
    cells.forEach((cell, ci) => {
      if (!cell) { lastAnchor = -1; return; }
      if (!cell.filler) { lastAnchor = talents[specKey + '_r' + ri + 'c' + ci] ? ci : -1; return; }
      if (lastAnchor === -1) return;
      talents[specKey + '_r' + ri + 'c' + ci] = { row: ri, col: ci };
    });
  });
  // Rank counts (OWNED n/m for abilities appearing in multiple tiers).
  const rankTotalByKey = {}, rankIndexByCell = {}, rankSeen = {};
  treeRows.forEach(r => r.talents.forEach(cell => { if (cell && !cell.filler) rankTotalByKey[cell._abilityKey] = (rankTotalByKey[cell._abilityKey] || 0) + 1; }));
  treeRows.forEach((r, ri) => r.talents.forEach((cell, ci) => { if (!cell || cell.filler) return; rankSeen[cell._abilityKey] = (rankSeen[cell._abilityKey] || 0) + 1; rankIndexByCell['r' + ri + 'c' + ci] = rankSeen[cell._abilityKey]; }));
  // R-M13B-161 (Modify alone, `buyOnCell`): does refunding this owned upgrade leave every other one connected? The talents'
  // own check; a wide box's filler columns leave the simulated map with it, or they would keep connecting what hangs below.
  const keepsTree = (ri, ci) => {
    const less = Object.assign({}, talents), row = treeRows[ri].talents;
    for (let fi = ci + 1; fi < COLS && row[fi] && row[fi].filler; fi++) delete less[specKey + '_r' + ri + 'c' + fi];
    return fcTalentIsRefundable(specKey, ri, ci, treeRows, less);
  };
  // Normalize.
  const rows = treeRows.map((r, ri) => ({
    cost: null,
    cells: r.talents.map((cell, ci) => {
      if (!cell) return null;
      const isPurchased = fcTalentIsPurchased(specKey, ri, ci, talents);
      const isAvailable = ri === 0 || fcTalentIsAvailable(specKey, ri, ci, treeRows, talents);
      // `basicOwned === false` — the CREATOR's Force step, where the basic power is the thing being
      // bought: row 0 reads UNOWNED (locked, nothing offered) until the purchase; every other consumer
      // (the sheet, ADVANCEMENT, the read-only previews) leaves it undefined and row 0 stays GRANTED.
      const state = ri === 0 ? (basicOwned === false ? 'locked' : 'granted') : isPurchased ? 'owned' : isAvailable ? 'available' : 'locked';
      if (cell.filler) return { key: 'r' + ri + 'c' + ci, filler: true, state, up: cell.up, down: cell.down, left: false, right: false, span: 0 };
      const ab = ((power.abilities || {})[cell._abilityKey]) || {};
      // A5 (argo-dataset-import-draft ADDENDUM 4 item 3): the user's imported rule text through the one accessor; null on holocron.
      const abDesc = ab.description || (window.SWRPGSources && window.SWRPGSources.ruleText ? window.SWRPGSources.ruleText : () => null)('force_powers', power.id, 'abilities.' + cell._abilityKey + '.description') || '';   // A5
      const name = (ab.name || cell._abilityKey || '').toString().toUpperCase();
      const rankTotal = rankTotalByKey[cell._abilityKey] || 1, rankIdx = rankIndexByCell['r' + ri + 'c' + ci] || 1;
      const statusLabel = ri === 0 ? 'STARTING' : isPurchased ? (rankTotal > 1 ? ('OWNED ' + rankIdx + '/' + rankTotal) : 'OWNED') : isAvailable ? (cell._cost + ' XP') : 'LOCKED';
      const buyable = ri !== 0 && !isPurchased;
      return {
        key: 'r' + ri + 'c' + ci, title: name, statusLabel, state,
        up: cell.up, down: cell.down, left: cell.left, right: cell.right, span: cell._span || 1, filler: false, ownedDot: false,
        // THE BOARD SKIN'S TWO FACTS (R-TTS-1): the board's Force frame paints the basic power ACTIVE
        // and every upgrade PASSIVE; the price is the cell's own.
        cost: cell._cost, activation: ri === 0 ? 'active' : 'passive',
        entry: { cellKey: 'r' + ri + 'c' + ci,
          descShort: ri === 0 ? String(abDesc).split(/\n\s*\n/)[0] : undefined,
          cellId: specKey + '_r' + ri + 'c' + ci, lockedHint: ri,
          // R-DT-2/3 (ruling directional-tree-build C1): "what buying does" per kind + the power's source
          // cite (Force abilities carry no per-ability source; the whole tree is one book).
          buyingDoes: null,
          // B-336: the power's books through the shared resolver, as the talent cell's cite above — a key ('fad') printed raw.
          sourceCite: ((s1) => (s1 != null ? (s1 || null) : (power && power.sources && power.sources.length) ? power.sources.map(gameLineTitle).join(' · ') : null))(
            window.SWRPGSources && window.SWRPGSources.removedLine ? window.SWRPGSources.removedLine(Object.assign({}, ab, { sources: power && power.sources, cite: ab.cite || (power && power.cite) })) : null),   // S1, as the talent cell: the power's books, pages from the ability's own cites (a signature ability's, its record's cite)
          name: ab.name || cell._abilityKey, meta: statusLabel,
          desc: abDesc || (ri === 0 ? ((power && power.description) || '') : ''),
          buy: readOnly ? null : { state: ri === 0 ? 'granted' : isPurchased ? 'owned' : isAvailable ? ((availableXp != null && cell._cost > availableXp) ? 'needxp' : 'buyable') : 'locked', cost: cell._cost, label: 'BUY UPGRADE', doBuy: buyable ? (() => onBuy && onBuy(cell._abilityKey, ab.name || cell._abilityKey, cell._cost, ri + '-' + ci)) : (() => {}) },
          refund: null,
          ...(buyOnCell && ri !== 0 && isPurchased ? { keepsTree: keepsTree(ri, ci) } : {}),
        },
      };
    }),
  }));
  const model = { specKey, rows, treeClass: 'hp-forcetree', skin: skin || undefined, interactive: interactive, cssSized: cssSized || undefined };
  if (buyOnCell) model.buyOnCell = true;   // R-M13B-158: off by default; every other mount's model is as before
  return model;
}

/* ── F-100 M5 C7.5 — THE AUTHOR MODE'S BUILDER (the third one; frames F7 · U1b · U10b · U11 · U13b) ──────────────────
   A specialization RECORD → the board model the homebrew editor's tree draws. Neutral cells (nothing bought, nothing to
   buy): each carries its talent's name, its chips (the caller's `chipsOf(record)` — SWRPGEffectClass's one rule), its
   row's cost, the struck "was <X>" of a box the edit replaced, and `gone` for a talent missing from `talentDb` (U10:
   the editor draws "Deleted talent — pick another"). `talentDb` is book ∪ own (the editor's view). The model's `author`
   block is the mode ('edit' | 'preview'), the controlled selection, the armed edge and the two callbacks: onPick(r, c)
   opens the picker for a box; onEdge(r, c, dir) toggles the link to the right ('right') or below ('down'), both sides
   written by the caller (C2.3). The board skin's author branch below draws it; the buy path is untouched. */
function specTreeToAuthorModel({ specData, talentDb, chipsOf, mode, selected, was, armed, onPick, onEdge }) {
  const tree = (specData && specData.talent_tree) || [];
  const db = talentDb || {};
  const rows = tree.map((row, ri) => ({
    cost: row.cost,
    cells: (row.talents || []).map((cell, ci) => {
      const key = ri + '-' + ci, id = cell && cell.talent;
      const rec = (id && Object.prototype.hasOwnProperty.call(db, id)) ? db[id] : null;
      const links = (cell && cell.links) || {};
      const chips = rec && typeof chipsOf === 'function' ? (chipsOf(rec) || []) : [];
      return {
        key, row: ri, col: ci, talentId: id || null, gone: !rec, title: rec ? (rec.name || id) : 'Deleted talent', chips, cost: row.cost,
        up: !!links.up, down: !!links.down, left: !!links.left, right: !!links.right, span: 1, filler: false,
        selected: selected === key, was: (was && was[key]) || null,
        entry: rec ? { name: rec.name || id, chips, desc: rec.description || (window.SWRPGSources && window.SWRPGSources.ruleText ? window.SWRPGSources.ruleText : () => null)('talents', id, 'description') || '', activation: rec.activation, ranked: !!rec.ranked, row: ri, col: ci, cost: row.cost, talentKey: id, preview: true }
                   : { name: 'Deleted talent', chips: [], desc: 'This talent was deleted from your homebrew.', row: ri, col: ci, cost: row.cost, talentKey: id, gone: true, preview: true },
      };
    }),
  }));
  return { skin: 'board', treeClass: 'hp-authortree', rows, author: { mode: mode === 'preview' ? 'preview' : 'edit', armed: armed || null, onPick, onEdge } };
}

/* ── F-100 M10 — THE POWER AUTHOR MODEL (ruling f100-m10-editor-card R-M10E-4; frames F3 · F4) ──────────────────────────────
   A Force power RECORD → the board model the author branch above draws, beside specTreeToAuthorModel (one tree component,
   tree-standardization-brief). Each row is four columns: a box at its `col` carries its upgrade's name, its OWN cost and its
   `span`; the columns it covers carry `filler` cells pointing at it (`anchor`); an empty column is null (drawn as a slot when
   the caller passes `onSlot`). Rows carry no cost (the cost is per box). A box whose upgrade is not one of the power's is
   `gone` (the editor draws "No upgrade — pick one"). `was[key]` is the struck name of the upgrade the edit replaced. The
   author block adds `onSlot`, `slotLabel`, `goneLabel` and `noun` to the specialization's; onEdge(r, c, 'down', col) names
   the column of a wide box's link. */
function powerToAuthorModel({ power, mode, selected, was, armed, onPick, onEdge, onSlot, slotLabel, goneLabel }) {
  const COLS = 4;
  const abs = (power && power.abilities) || {};
  const rows = ((power && power.tree) || []).map((row, ri) => {
    const cells = [null, null, null, null];
    ((row && row.cells) || []).forEach((c) => {
      if (!c || typeof c.col !== 'number' || c.col < 0 || c.col >= COLS) return;
      const key = ri + '-' + c.col, ab = (typeof c.ability === 'string' && Object.prototype.hasOwnProperty.call(abs, c.ability)) ? abs[c.ability] : null;
      const span = Math.max(1, Math.min(COLS - c.col, c.span || 1)), L = c.links || {};
      const title = ab ? (ab.name || c.ability) : '';
      cells[c.col] = {
        key, row: ri, col: c.col, ability: c.ability || null, gone: !ab, title, chips: [], cost: c.cost, span, filler: false,
        up: !!L.up, down: !!L.down, left: !!L.left, right: !!L.right, selected: selected === key, was: (was && was[key]) || null,
        entry: { name: title, chips: [], desc: ab ? (ab.description || (window.SWRPGSources && window.SWRPGSources.ruleText ? window.SWRPGSources.ruleText : () => null)('force_powers', power && power.id, 'abilities.' + c.ability + '.description') || '') : '', row: ri, col: c.col, cost: c.cost, gone: !ab, power: true, preview: true },
      };
      for (let k = c.col + 1; k < c.col + span; k++) cells[k] = { key: ri + '-' + k, filler: true, anchor: c.col, up: !!L.up, down: !!L.down };
    });
    return { cost: null, cells };
  });
  return { skin: 'board', treeClass: 'hp-authortree', rows,
    author: { mode: mode === 'preview' ? 'preview' : 'edit', armed: armed || null, onPick, onEdge, onSlot: onSlot || null, slotLabel, goneLabel, noun: 'upgrade' } };
}

window.SWRPGTree = {
  DirectionalTree: DirectionalTree, DirectionalTreeSheet: DirectionalTreeSheet, DirectionalTreeEntryBody: DirectionalTreeEntryBody,
  talentTreeToModel: talentTreeToModel, forcePowerToModel: forcePowerToModel, specTreeToAuthorModel: specTreeToAuthorModel, powerToAuthorModel: powerToAuthorModel, dtCellSkin: dtCellSkin,
  fcTalentIsPurchased: fcTalentIsPurchased, fcTalentReachCosts: fcTalentReachCosts, fcTalentIsConnected: fcTalentIsConnected,
  fcTalentIsAvailable: fcTalentIsAvailable, fcTalentIsRefundable: fcTalentIsRefundable,
  env: {},
  configure: function (o) { var n = {}, k; for (k in this.env) n[k] = this.env[k]; for (k in o) n[k] = o[k]; this.env = n; },
};
})();

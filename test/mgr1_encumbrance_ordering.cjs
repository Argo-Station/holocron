#!/usr/bin/env node
/**
 * mgr1_encumbrance_ordering.cjs — R-MGR-1 guard.
 *
 * computeEncumbrance reads `state:` but does NOT stamp it — that is deriveItemState's job,
 * called by resolveSheetEquipment. The encumbrance number is correct ONLY because
 * resolveSheetEquipment ran first. This guard pins that ordering, and it is the only instrument
 * in the repo watching for a SECOND implementation of encumbrance.
 *
 * ── B-739: THE ADMITTED SET IS DERIVED, NOT TYPED ────────────────────────────────────────────
 * This guard used to open with "player/app.jsx has exactly 6 computeEncumbrance calls" and a second
 * assert naming the one that sits inside `fcGearEncumbrance`. The paper sheet's `SheetSpine` and
 * `SheetStack` became a seventh and eighth caller — BOTH passing resolver-resolved equipment, so the
 * ordering premise held perfectly — and the guard went RED anyway and stayed red, which means it
 * could not have reported a real drift if one had arrived (the character-maths audit, §2.2).
 *
 * A hand-typed count is not the property. The property is: **every caller is handed equipment that
 * has been through the resolver** (or built and stamped in place). So the count is gone and each
 * call site is CLASSIFIED from the source into exactly one of three admitted shapes, or fails:
 *
 *   LOCAL-RESOLVED  the argument is bound in the enclosing top-level function from
 *                   `resolveSheetEquipment(...)` — the plain case (the two PDF exports, DiceHub,
 *                   SheetLoadout).
 *   FED             the argument is a PARAMETER (positional, or a `p.<name>` prop read) of the
 *                   enclosing function, and EVERY supplier of that parameter anywhere in the file
 *                   hands it an identifier that is itself LOCAL-RESOLVED in ITS own function.
 *                   This is what admits `computeWeaponPool`'s 6th argument and the paper sheet's
 *                   two components — derived from their call sites, not from their names.
 *   SELF-STAMPED    the argument is an object LITERAL built in the enclosing function which stamps
 *                   `state:` on its own entries before the call. One call qualifies today —
 *                   `fcGearEncumbrance`, the creator's gear step (`gear-concept` R-GC-3: "the ONE
 *                   call, no sum at the step"), whose single suit goes over as `state: 'worn'`
 *                   (B-700, Jason 2026-09-19 "Worn"; EotE p.168's −3 — R-ASS-1's worn-singular) and
 *                   where nothing is stowed at creation. It is admitted by what the code DOES, so
 *                   the exception cannot outlive the stamp that earns it.
 *
 * A NINTH caller that passes raw equipment therefore still fails here — by name and line — while a
 * ninth that passes resolved equipment is admitted silently, which is the whole difference between
 * an instrument and a tripwire.
 *
 * Run: node test/mgr1_encumbrance_ordering.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

let pass = 0, fail = 0;
function check(label, ok) {
  if (ok) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

console.log('R-MGR-1: encumbrance ordering — deriveItemState before computeEncumbrance\n');

// D-507 (handoff `encounters-e3-dicehub-move`): DiceHub and computeWeaponPool (two of the callers this derivation classifies) moved
// VERBATIM with DiceHub's closure to lib/shared/diceHub.jsx. The derivation runs over EACH file on its own — its top-level functions,
// its call sites, its suppliers — never one blob; a caller is classified in the file it lives in, exactly as before.
const SHEET_FILES = ['player/app.jsx', 'lib/shared/diceHub.jsx'];
function analyze(rel) {
  const appSrc = read(rel);
  const appLines = appSrc.split('\n');

  // ── The file's top-level functions, sliced by their own declarations (the same slicing
  //    scripts/dice_hub_fixture.cjs uses). A call's enclosing function is the last one that opened
  //    before it.
  const tops = [];
  appLines.forEach(function (l, i) {
    const m = l.match(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/);
    if (m) tops.push({ name: m[1], start: i + 1, sig: l });
  });
  tops.forEach(function (t, i) { t.end = (i + 1 < tops.length) ? tops[i + 1].start - 1 : appLines.length; });
  function enclosing(line) {
    for (let i = tops.length - 1; i >= 0; i--) if (line >= tops[i].start && line <= tops[i].end) return tops[i];
    return null;
  }
  function bodyOf(fn) { return appLines.slice(fn.start - 1, fn.end).join('\n'); }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Is `name` bound from resolveSheetEquipment inside `fn`? (`var x = resolveSheetEquipment(...)` and
  // the `React.useMemo(function () { return resolveSheetEquipment(...) })` shape the sheet uses.)
  function localResolved(fn, name) {
    if (!fn) return false;
    return new RegExp('\\b' + esc(name) + '\\s*=[\\s\\S]{0,200}?resolveSheetEquipment\\s*\\(').test(bodyOf(fn));
  }

  // ── Every computeEncumbrance call in player/app.jsx, with the identifier it passes ──────────────
  const encCalls = [];
  appLines.forEach(function (line, i) {
    if (/computeEncumbrance\s*\(/.test(line) && !/^\s*\/\//.test(line) && !/function computeEncumbrance/.test(line)) {
      const arg = (line.match(/computeEncumbrance\s*\(\s*([A-Za-z0-9_$.]+)/) || [])[1] || null;
      encCalls.push({ line: i + 1, text: line.trim(), arg: arg, fn: enclosing(i + 1) });
    }
    // RE-POINTED (f100-surfacing-sheet-build; ruling f100-surfacing-sheet-concept R-SSC-4, ADDENDUM 10 C3 (a)): the hub row's
    // builder moved into lib/shared/sheetPool.js's weaponPoolOf, which hands its `opts.equipment` to computeEncumbrance (§3
    // below admits that one call). So every app call of weaponPoolOf is a computeEncumbrance call by proxy: its `equipment:`
    // identifier is classified exactly as a direct call's argument is.
    if (/SWRPGSheetPool\.weaponPoolOf\s*\(/.test(line) && !/^\s*\/\//.test(line)) {
      const arg = ((line + ' ' + (appLines[i + 1] || '')).match(/\bequipment:\s*([A-Za-z0-9_$.]+)/) || [])[1] || null;   // the call may wrap
      encCalls.push({ line: i + 1, text: line.trim(), arg: arg, fn: enclosing(i + 1), proxy: 'weaponPoolOf' });
    }
  });

  // ── Classify each one ───────────────────────────────────────────────────────────────────────────
  function suppliersOf(fn, param) {
    // Where does `param` come from? Either a positional argument of `fn`, or a prop read `p.<param>`.
    const sigParams = (fn.sig.match(/\(([^)]*)\)/) || [, ''])[1]
      .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    const idx = sigParams.indexOf(param);
    const out = [];
    if (idx >= 0) {
      // plain function: read the idx'th argument at every call site but the declaration
      const re = new RegExp(esc(fn.name) + '\\s*\\(([^;]*?)\\)', 'g');
      appLines.forEach(function (l, i) {
        if (i + 1 === fn.start) return;
        let m;
        while ((m = re.exec(l)) !== null) {
          const args = m[1].split(',').map(function (s) { return s.trim(); });
          if (args.length > idx) out.push({ line: i + 1, expr: args[idx] });
        }
      });
      return { how: 'positional arg #' + idx, sites: out };
    }
    // prop read: `equipment = p.equipment` / `props.equipment`, supplied as `<Fn equipment={X}`
    const propRe = new RegExp('\\b' + esc(param) + '\\s*=\\s*(?:p|props)\\.' + esc(param) + '\\b');
    if (propRe.test(bodyOf(fn))) {
      const jsx = new RegExp('<' + esc(fn.name) + '\\b[^>]*?\\b' + esc(param) + '=\\{([^}]*)\\}');
      appLines.forEach(function (l, i) {
        const m = l.match(jsx);
        if (m) out.push({ line: i + 1, expr: m[1].trim() });
      });
      return { how: 'prop ' + param + '={…}', sites: out };
    }
    return null;
  }

  function classify(c) {
    if (!c.arg || !c.fn) return { kind: 'UNRESOLVABLE', why: 'no argument identifier or no enclosing function' };
    if (localResolved(c.fn, c.arg)) {
      return { kind: 'LOCAL-RESOLVED', why: c.arg + ' = resolveSheetEquipment(…) in ' + c.fn.name };
    }
    const fed = suppliersOf(c.fn, c.arg);
    if (fed && fed.sites.length > 0) {
      const bad = fed.sites.filter(function (s) {
        const sf = enclosing(s.line);
        return !(/^[A-Za-z0-9_$]+$/.test(s.expr) && localResolved(sf, s.expr));
      });
      if (bad.length === 0) {
        return { kind: 'FED', why: fed.how + ' from ' + fed.sites.length + ' site' +
          (fed.sites.length === 1 ? '' : 's') + ' (' + fed.sites.map(function (s) { return s.line; }).join(', ') +
          '), every one resolver-resolved' };
      }
      return { kind: 'RAW-FED', why: fed.how + ' — NOT resolver-resolved at line' +
        (bad.length === 1 ? ' ' : 's ') + bad.map(function (s) { return s.line + ' (' + s.expr + ')'; }).join(', ') };
    }
    // SELF-STAMPED: built here as a literal, and stamped with a state before the call.
    const body = bodyOf(c.fn);
    const litAt = body.search(new RegExp('\\b(?:var|let|const)\\s+' + esc(c.arg) + '\\s*=\\s*\\{'));
    const stampAt = body.search(/\bstate:\s*['"]/);
    if (litAt > -1 && stampAt > litAt) {
      return { kind: 'SELF-STAMPED', why: c.arg + ' is built as a literal in ' + c.fn.name +
        ' and stamps state: itself before the call' };
    }
    return { kind: 'RAW', why: c.arg + ' in ' + c.fn.name + ' is neither resolver-resolved, fed from a ' +
      'resolved binding, nor self-stamped' };
  }

  encCalls.forEach(function (c) { c.cls = classify(c); });
  encCalls.forEach(function (c) { c.file = rel; });
  return { file: rel, lines: appLines, encCalls: encCalls };
}
const ANALYSES = SHEET_FILES.map(analyze);
const encCalls = [].concat.apply([], ANALYSES.map(function (a) { return a.encCalls; }));


console.log('  the admitted set, DERIVED (no count is typed here):');
encCalls.forEach(function (c) {
  console.log('    ' + (c.file === 'player/app.jsx' ? 'app.jsx' : 'diceHub.jsx').padEnd(12) + String(c.line).padStart(6) + '  ' + (c.fn ? c.fn.name : '?').padEnd(20) +
              (c.cls.kind + '  ').padEnd(16) + c.cls.why);
});
console.log('');

const admitted = ['LOCAL-RESOLVED', 'FED', 'SELF-STAMPED'];
const rejected = encCalls.filter(function (c) { return admitted.indexOf(c.cls.kind) === -1; });
check('every computeEncumbrance caller in player/app.jsx and lib/shared/diceHub.jsx passes RESOLVED equipment — ' +
  encCalls.length + ' call sites, all admitted by derivation' +
  (rejected.length ? '; REJECTED: ' + rejected.map(function (c) { return c.file + ':' + (c.fn ? c.fn.name + ':' + c.line : c.line); }).join(', ') : ''),
  encCalls.length > 0 && rejected.length === 0);

// NON-VACUITY, permanent: a classifier that admitted everything by accident would read the same as
// this one. So it must actually have HAD to look: at least one call is admitted by each of the two
// shapes a plain "is it named resolveSheetEquipment" check cannot see.
const kinds = {};
encCalls.forEach(function (c) { kinds[c.cls.kind] = (kinds[c.cls.kind] || 0) + 1; });
check('the derivation is non-vacuous — at least one FED call (resolved at its supplier, not here) ' +
  'and at least one SELF-STAMPED call are admitted (' + JSON.stringify(kinds) + ')',
  (kinds['FED'] || 0) >= 1 && (kinds['SELF-STAMPED'] || 0) >= 1 && (kinds['LOCAL-RESOLVED'] || 0) >= 1);

// 3. No other product file calls computeEncumbrance
var otherCallers = [];
function scanDir(dir, ext) {
  if (!fs.existsSync(path.join(REPO, dir))) return;
  fs.readdirSync(path.join(REPO, dir)).forEach(function (f) {
    if (!f.endsWith(ext)) return;
    var content = read(dir + '/' + f);
    // a CALL, not a mention: effectClass.js cites the symbol by name as the encumbrance reader (R-FIEC-1),
    // which is evidence about it, not a caller (instrument re-point; the claim — no other caller — is kept)
    // sheetPool.js: ONE call, inside weaponPoolOf, of its `opts.equipment` (the re-point above classifies every app caller's)
    if (dir === 'lib/shared' && f === 'sheetPool.js' && (content.match(/computeEncumbrance\s*\(/g) || []).length === 1 &&
        /\bresolvedEquipment = opts\.equipment\b/.test(content) &&
        /function weaponPoolOf\(sheet, weapon, opts\)[\s\S]*?CR\.computeEncumbrance\(resolvedEquipment,/.test(content)) return;
    // diceHub.js: the gitignored BUILD of lib/shared/diceHub.jsx (build/sources.mjs), whose callers §2 classifies from source (D-507)
    if (dir === 'lib/shared' && f === 'diceHub.js' && fs.existsSync(path.join(REPO, 'lib/shared/diceHub.jsx'))) return;
    if (/computeEncumbrance\s*\(/.test(content) && f !== 'charResolve.js') {
      otherCallers.push(dir + '/' + f);
    }
  });
}
scanDir('gm', '.jsx');
scanDir('gm', '.js');
scanDir('dice', '.jsx');
scanDir('dice', '.js');
scanDir('lib/shared', '.js');
scanDir('lib/dice', '.js');
check('no other product file calls computeEncumbrance (found: ' +
  (otherCallers.length ? otherCallers.join(', ') : 'none') + ')',
  otherCallers.length === 0);

// 4. deriveItemState stamps .state inside resolveSheetEquipment — both moved VERBATIM from player/app.jsx to
// lib/shared/sheetPool.js (R-S4PP-1, ruling `shipyard-s4-ship-pool-path`), so their text is read there (norm 3)
var poolSrc = read('lib/shared/sheetPool.js');
var deriveFn = poolSrc.indexOf('function deriveItemState');
var resolveFn = poolSrc.indexOf('function resolveSheetEquipment');
check('deriveItemState is defined before resolveSheetEquipment',
  deriveFn > -1 && resolveFn > -1 && deriveFn < resolveFn);

// deriveItemState is called inside resolveSheetEquipment body (stamps .state on entries)
// RE-POINTED (B-1185, ruling `f100-b1185-card` ADDENDUM 4, R-B1185-15): the body is read up to the function's OWN closing
// brace (the first top-level `\n}\n` after its head), not `resolveFn + 3000`. The fixed window was a hand-typed number
// standing in for "the function" — B-739's lesson, above — and it held 68 characters of headroom until the shared
// attachment path grew the function; the calls were all still there. The claim is kept: at least three calls inside it.
var resolveEnd = resolveFn > -1 ? poolSrc.indexOf('\n}\n', resolveFn) : -1;
var resolveBody = resolveEnd > -1 ? poolSrc.substring(resolveFn, resolveEnd) : '';
var deriveCallsInResolve = (resolveBody.match(/deriveItemState\s*\(/g) || []).length;
check('resolveSheetEquipment calls deriveItemState (' + deriveCallsInResolve + ' times)',
  deriveCallsInResolve >= 3);

// Every SHEET-SIDE computeEncumbrance call is AFTER at least one resolveSheetEquipment call. Which
// calls are sheet-side is DERIVED too: everything but the SELF-STAMPED ones, whose equipment is
// built in place and has nothing for the resolver to do.
// D-507: measured in player/app.jsx, as at the cut (the file's first sheet-side call is still generateCustomPdf). The calls that
// moved to lib/shared/diceHub.jsx are each admitted by derivation above (computeWeaponPool FED, DiceHub LOCAL-RESOLVED); the
// module's verbatim order puts computeWeaponPool's line above its suppliers, so a file-position test there would measure layout,
// not the property — it is not applied there (KEEPS the cut's measurement; DROPS nothing it measured)
var sheetCalls = encCalls.filter(function (c) { return c.cls.kind !== 'SELF-STAMPED'; });
var order = ANALYSES.filter(function (a) { return a.file === 'player/app.jsx'; }).map(function (a) {
  var mine = sheetCalls.filter(function (c) { return c.file === a.file; });
  var firstEncLine = mine.length > 0 ? mine[0].line : -1, firstResolveLine = -1;
  a.lines.forEach(function (line, i) {
    if (/resolveSheetEquipment\s*\(/.test(line) && firstResolveLine === -1) {
      firstResolveLine = i + 1;
    }
  });
  return { file: a.file, n: mine.length, firstResolveLine: firstResolveLine, firstEncLine: firstEncLine };
}).filter(function (o) { return o.n > 0; });
check('resolveSheetEquipment runs before the first SHEET-SIDE computeEncumbrance (' + order.map(function (o) {
  return o.file + ': line ' + o.firstResolveLine + ' < line ' + o.firstEncLine; }).join(' · ') + ', over ' + sheetCalls.filter(function (c) { return c.file === 'player/app.jsx'; }).length + ' sheet-side calls in player/app.jsx)',
  order.length > 0 && order.every(function (o) { return o.firstResolveLine > 0 && o.firstEncLine > o.firstResolveLine; }));

// 5. computeEncumbrance itself does NOT call deriveItemState (it expects pre-stamped data)
var crSrc = read('lib/shared/charResolve.js');
var encFnStart = crSrc.indexOf('function computeEncumbrance');
var encFnBody = crSrc.substring(encFnStart, encFnStart + 2000);
check('computeEncumbrance does NOT call deriveItemState (no internal migration)',
  !/deriveItemState/.test(encFnBody));

console.log('\nmgr1_encumbrance_ordering: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);

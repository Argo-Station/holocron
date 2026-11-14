#!/usr/bin/env node
/**
 * f100_m12_key_chips.cjs — GUARD for f100-m12-build-card ADDENDUM 40 R-M12B-136: the editor's chips and claims on M12 key
 * arms come from THE ONE effectClass function (SWRPGEffectClass.keyFieldClassOf); no form hard-codes a class.
 * RE-POINTED by release-r7-bug-burndown ADDENDUM 638 (M12's key is deleted): KEEPS the ON chips ('resolves') and the table's
 * evidence; DROPS the OFF column ('prints'), the readers' `key` literal and "asks SWRPGEngineRules".
 *
 *   K1  THE TABLE HOLDS TO THE CODE (fieldClassOf's evidence rule): every KEY_FIELDS reader names a symbol defined in its
 *       file, whose body holds the `read` literal; and its `via` call site
 *       exists outside that body (a dead reader is no reader). tree.cost HAS its charging reader (re-classed by creator
 *       concept ADDENDUM 21 (ii), D-229 Q1 (a)): its row names sigAbilitiesSpend, and sigAbilitiesXp — the one cost walk —
 *       is called outside its definition only from charResolve.js (the summer; a surface calling it elsewhere reads red).
 *   K2  THE ANSWERS: careers.effects, careers.xp_adjustment, signature_abilities.tree.cost and
 *       signature_abilities.attach.columns are 'resolves'; a field off the table is null.
 *   K3  THE VIEW: lib/editor/view.jsx's four member fields (the Attributes rows, Extra starting XP, the box panel's Cost,
 *       Attaches under) take their chip from keyChip(section, field), and keyChip from keyFieldClassOf; the Attributes
 *       note prints its first sentence only where keyChip('careers', 'effects') reads AUTOMATIC; no member field carries a
 *       literal chip.
 *
 * Run: node test/f100_m12_key_chips.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const E = require(path.join(ROOT, 'lib/shared/effectClass.js'));
let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('PASS  ' + label); } else { fail++; console.log('FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
}
// a symbol's body: from `function <sym>(` to the next line opening a function at the same indent (the file's idiom)
function bodyOf(src, sym) {
  const at = src.search(new RegExp('\\n(\\s*)function ' + sym + '\\('));
  if (at < 0) return null;
  const indent = src.slice(at + 1).match(/^\s*/)[0];
  const rest = src.slice(at + 1);
  const next = rest.slice(1).search(new RegExp('\\n' + indent + '(function |var |// )'));
  return { start: at + 1, text: next < 0 ? rest : rest.slice(0, next + 1) };
}

// K1
const MEMBERS = [['careers', 'effects'], ['careers', 'xp_adjustment'], ['signature_abilities', 'tree.cost'], ['signature_abilities', 'attach.columns']];
check('K1 KEY_FIELDS holds exactly the four members', JSON.stringify(Object.keys(E.KEY_FIELDS).flatMap((s) => Object.keys(E.KEY_FIELDS[s]).map((f) => s + '.' + f)).sort()) ===
  JSON.stringify(MEMBERS.map((m) => m.join('.')).sort()));
MEMBERS.forEach(([s, f]) => {
  E.KEY_FIELDS[s][f].forEach((r) => {
    const src = rd(r.file), b = bodyOf(src, r.symbol);
    check(`K1 ${s}.${f}: ${r.symbol} is defined in ${r.file}`, !!b);
    if (!b) return;
    check(`K1 ${s}.${f}: ${r.symbol}'s body reads \`${r.read}\``, b.text.indexOf(r.read) >= 0);
    const vsrc = rd(r.via.file);
    const outside = r.via.file === r.file ? (vsrc.slice(0, b.start) + vsrc.slice(b.start + b.text.length)) : vsrc;
    check(`K1 ${s}.${f}: a live call site \`${r.via.read}\` in ${r.via.file}, outside ${r.symbol}`, outside.indexOf(r.via.read) >= 0);
  });
});
const tracked = execSync('git ls-files -- lib player gm', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => /\.(js|jsx)$/.test(f));
const xpCallers = tracked.filter((f) => {
  let src = rd(f);
  if (f === 'lib/shared/charResolve.js') { const b = bodyOf(src, 'sigAbilitiesXp'); src = src.slice(0, b.start) + src.slice(b.start + b.text.length); }
  return /sigAbilitiesXp\s*\(/.test(src);
});
// The two laps merged (f100-surfacing-creator-concept ADDENDA 21 (ii) / 24 step (1); f100-surfacing-sheet-concept ADDENDUM 8
// R-SSC-3): tree.cost has ONE charging reader (sigAbilitiesSpend, the creator BUILD's charge, D-229 creator Q1 (a)); the cost
// walk it sums (sigAbilitiesXp) is called outside its definition by charResolve.js (the charge) and player/app.jsx (the
// sheet's SHOWN XP, sheetSignatureEntries — one call, "<n> upgrades · <XP> XP"; a shown number is not a charging reader).
const xpAppCalls = (rd('player/app.jsx').match(/sigAbilitiesXp\s*\(/g) || []).length;
check('K1 tree.cost has its charging reader: the row names sigAbilitiesSpend; sigAbilitiesXp is called outside its definition by charResolve.js and the sheet\'s shown XP, sheetSignatureEntries (' + tracked.length + ' tracked sources)',
  E.KEY_FIELDS.signature_abilities['tree.cost'].length === 1 && E.KEY_FIELDS.signature_abilities['tree.cost'][0].symbol === 'sigAbilitiesSpend'
  && JSON.stringify(xpCallers) === JSON.stringify(['lib/shared/charResolve.js', 'player/app.jsx']) && xpAppCalls === 1
  && /function sheetSignatureEntries\(sheet, cb\)[\s\S]*?CharResolve\.sigAbilitiesXp\(sheet, cb\)/.test(rd('player/app.jsx')), JSON.stringify(xpCallers) + ' · app calls ' + xpAppCalls);

// K2
MEMBERS.forEach(([s, f]) => {   // tree.cost re-classed, ADDENDUM 21 (ii)
  const got = E.keyFieldClassOf(s, f);
  check(`K2 ${s}.${f}: resolves`, got === 'resolves', JSON.stringify(got));
});
check('K2 a field off the table answers null (careers.career_skills, talents.effects)',
  E.keyFieldClassOf('careers', 'career_skills') === null && E.keyFieldClassOf('talents', 'effects') === null);

// K3
const V = rd('lib/editor/view.jsx');
check('K3 keyChip reads SWRPGEffectClass.keyFieldClassOf', /function keyChip\(sec, field\) \{ return chipOf\(EC\(\) \? EC\(\)\.keyFieldClassOf\(sec, field\) : 'prints'\); \}/.test(V));
const SITES = [["field: 'effects.' + row[0]", "keyChip('careers', 'effects')"], ["field: 'xp_adjustment', key: 'xp'", "keyChip('careers', 'xp_adjustment')"],
  ["k: FW.cost, field: 'tree.cost' }", "keyChip('signature_abilities', 'tree.cost')"], ["k: SGW.attachK, field: 'attach.columns'", "keyChip('signature_abilities', 'attach.columns')"]];
SITES.forEach(([needle, chip]) => {
  const lines = V.split('\n').filter((l) => l.indexOf(needle) >= 0 && /h\(Fl, \{ chip:/.test(l));
  check(`K3 the member field \`${needle}\` takes its chip from ${chip}, no literal`, lines.length >= 1 && lines.every((l) => l.indexOf('chip: ' + chip) >= 0), JSON.stringify(lines.map((l) => l.trim().slice(0, 100))));
});
// copy-voice-sweep-build area E row lib/editor/view.jsx:3451:39 (D-289): the note's first sentence is cut, so its
// R-M12B-136 key gate goes with it; "All 0 in every book." stays, always
check('K3 the Attributes note: "All 0 in every book." always; its first sentence cut (D-289)',
  V.indexOf("key: 'n' }, CRW.attrsNoteBooks)") >= 0 && V.indexOf('attrsNoteOn') < 0 &&
  V.indexOf("attrsNoteBooks: 'All 0 in every book.'") >= 0);

console.log('f100_m12_key_chips: ' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);

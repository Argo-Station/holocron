// test/fixtures/ship_identifier_svg.cjs — the ship identifier's fidelity instrument, its shared half (card
// `shipyard-schematic-build-card` R-SSB-2): ONE element builder, ONE serializer and ONE normalizer, used by BOTH the
// exporter (scripts/export_ship_identifier_fixture.cjs, which renders the LAB module) and the guard
// (test/ship_identifier_fidelity.cjs, which renders the PRODUCTION module), so the two can only differ in what the
// modules draw.
//
// The serializer writes an element tree as SVG markup with its attributes sorted (React's camelCase names mapped to
// SVG's), the way the lab's photographs were serialized. NORMALIZED means: every mask/pattern id renumbered in order
// of first appearance (each module counts its own ids), and the root's width/height lifted out into the case (FULL
// differs between host sizes in those two attributes only; the case keeps them and the guard compares them too).
'use strict';

function h(t, p) { const c = [].slice.call(arguments, 2); return { t, p: p || {}, c: [].concat.apply([], c.map((x) => (Array.isArray(x) ? x : [x]))).filter((x) => x != null && x !== false) }; }
const ATTR = { className: 'class', strokeWidth: 'stroke-width', strokeOpacity: 'stroke-opacity', strokeDasharray: 'stroke-dasharray',
  strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin', fillOpacity: 'fill-opacity', fillRule: 'fill-rule', clipRule: 'clip-rule',
  textAnchor: 'text-anchor', fontFamily: 'font-family', fontSize: 'font-size', fontWeight: 'font-weight', letterSpacing: 'letter-spacing',
  viewBox: 'viewBox', patternUnits: 'patternUnits', patternTransform: 'patternTransform', dominantBaseline: 'dominant-baseline' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const kebab = (k) => k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
function ser(n) {
  if (typeof n === 'string' || typeof n === 'number') return esc(n);
  const a = Object.keys(n.p).filter((k) => k !== 'key' && n.p[k] != null).sort().map((k) => {
    const v = n.p[k];
    if (k === 'style') return 'style="' + esc(Object.keys(v).sort().map((s) => kebab(s) + ':' + (typeof v[s] === 'number' && !/opacity|weight/.test(s) ? v[s] + 'px' : v[s])).join(';')) + '"';
    return (ATTR[k] || k) + '="' + esc(v) + '"';
  });
  return '<' + n.t + (a.length ? ' ' + a.join(' ') : '') + '>' + n.c.map(ser).join('') + '</' + n.t + '>';
}
// a rendered tree → { svg (normalized markup), width, height }
function normalized(tree) {
  const width = tree.p.width, height = tree.p.height;
  const root = Object.assign({}, tree, { p: Object.assign({}, tree.p, { width: 'W', height: 'H' }) });
  const ids = {}; let n = 0;
  const html = ser(root);
  // the ids each module mints (lab m9-/h9-, production shid-m/shid-h), in order of first appearance
  const svg = html.replace(/\b(?:m9-|h9-|shid-m|shid-h)\d+\b/g, (x) => ids[x] || (ids[x] = 'ID' + (++n)));
  return { svg, width, height };
}
module.exports = { h, ser, normalized };

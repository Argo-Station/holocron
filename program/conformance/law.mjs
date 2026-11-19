// law.mjs — the window's copy, read from LAW itself: `Docs/mockups/argo-a4-guide.html` (approved at f592705b7), the
// `-a` window frames and S5's (ruling `argo-a4-launcher-build` §4.2). Each frame's body is read as the text a person
// sees, one entry per text run or button, in order. "Link to your account" is dropped: it is T1's link card's and is not
// built here (D-615 b1). The illustrative address and version are swapped for the run's own.
// The body part is read per OS (ADDENDUM 7 §1, ERRATUM E-A4LB-3): `mac-body` on the Mac, `win-body` on Windows. On
// Windows S4's alert is the `win-body` inside `.win.dlg` (the dialog), never the first `win-body`, which is the window.
import fs from 'node:fs';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e] ?? m));

export const NOT_BUILT = ['Link to your account'];
export const DRAWN_ADDRESS = 'http://192.168.1.23:8250';
export const DRAWN_VERSION = '1.2.0';

/** The visible runs of one frame's window body (or its alert), in document order. */
export function frameRuns(html, frame, part = 'mac-body', within = null) {
  const at = html.indexOf(`data-frame="${frame}"`);
  if (at < 0) throw new Error(`LAW has no frame ${frame}`);
  const end = html.indexOf('</figure>', at);
  const fig = html.slice(at, end);
  // `within`: the part is the first one after this class (Windows S4: the win-body inside the .win.dlg dialog)
  const from = within ? fig.indexOf(`class="${within}"`) : 0;
  if (from < 0) throw new Error(`frame ${frame} has no ${within}`);
  const start = fig.indexOf(`class="${part}"`, from);
  if (start < 0) throw new Error(`frame ${frame} has no ${part}${within ? ' inside ' + within : ''}`);
  // the part's own element: count <div> depth from its opening tag
  let i = fig.lastIndexOf('<div', start), depth = 0, j = i;
  const tag = /<\/?div\b[^>]*>/g;
  tag.lastIndex = i;
  for (let m; (m = tag.exec(fig));) { depth += m[0][1] === '/' ? -1 : 1; if (depth === 0) { j = m.index; break; } }
  const body = fig.slice(i, j);
  return body.split(/<[^>]+>/).map((t) => decode(t).replace(/\s+/g, ' ').trim()).filter(Boolean)
    .filter((t) => !NOT_BUILT.includes(t));
}

export function loadLaw(file, os = 'mac') {
  const html = fs.readFileSync(file, 'utf8');
  const f = (s) => `window-${s}-${os}-a`;
  const body = os === 'mac' ? 'mac-body' : 'win-body';
  return {
    S1: frameRuns(html, f('s1'), body),
    S2: frameRuns(html, f('s2'), body),
    S3: frameRuns(html, f('s3'), body),
    S4window: frameRuns(html, f('s4'), body),
    S4alert: os === 'mac' ? frameRuns(html, f('s4'), 'mac-alert') : frameRuns(html, f('s4'), 'win-body', 'win dlg'),
    S5: frameRuns(html, `window-s5-${os}`, body),
  };
}

/** A drawn frame's runs with the run's own address and version in place of the illustrative ones. */
export function expect(runs, { address, version } = {}) {
  return runs.map((t) => (address != null ? t.split(DRAWN_ADDRESS).join(address) : t))
    .map((t) => (version != null ? t.split(`(${DRAWN_VERSION})`).join(`(${version})`) : t));
}

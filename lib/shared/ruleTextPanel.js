/* lib/shared/ruleTextPanel.js — A5's PANEL, "Fill in rule text…" (window.SWRPGRuleTextPanel.Panel). ONE module for the
 * player and GM apps (no reimplementation). Plain h(), no JSX, served raw.
 *
 * Law: the mockup Docs/mockups/argo-a5-import.html @ ad8cb3ac2 (D-589), frames M2–M5 and M7, copy verbatim; ruling
 * argo-dataset-import-draft §3 P-5 (one result: filled N of M, by kind, four reasons; mechanics voice, no helper text),
 * ADDENDUM 4 §A4.1 item 6, ADDENDUM 5 Q2 (a). Built in ArtworkPaper's idiom (lib/store/view.jsx): a paper window with
 * its head and ✕, a mono status line, two pick buttons, a report with ▸ folds, and a two-tap remove.
 *
 * It makes NO network call (G1): the loader (ruleTextLoad.js) fetches our records when the panel opens, the pick
 * buttons enable when it answers, and the import itself reads only the folder or zip the user picks. Shown only in a
 * copy whose book text was removed; the host's ⚙ row is the only door.
 */
(function (root) {
  'use strict';

  function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
  var NFMT = 'not a format Holocron reads yet';   // P-5's third reason (ruleText.js NFMT)
  var OUTSIDE = [['npcs', 'NPCs'], ['lore', 'Lore'], ['planets', 'Planets'], ['respecialized', 'reSpecialized'], ['other', 'Tables and other']];

  // the picked folder's files → [{path, text}] (webkitRelativePath keeps the picked folder's name first)
  function readFolder(fileList) {
    var xml = Array.prototype.filter.call(fileList, function (f) { return /\.xml$/i.test(f.name); });
    return Promise.all(xml.map(function (f) {
      return f.text().then(function (t) { return { path: (f.webkitRelativePath || f.name).replace(/\\/g, '/'), text: t }; });
    }));
  }

  function Panel(props) {
    var React = root.React, h = React.createElement, useState = React.useState, useEffect = React.useEffect, useRef = React.useRef;
    var UI = root.SWRPGUI || {}, RT = function () { return root.SWRPGRuleText; }, ST = root.SWRPGRuleTextStore;
    var toBody = UI.toBody || function (n) { return n; };
    var _ld = useState(null), loaded = _ld[0], setLoaded = _ld[1];
    var _rep = useState(ST ? ST.report() : null), report = _rep[0], setReport = _rep[1];
    var _busy = useState(null), busy = _busy[0], setBusy = _busy[1];          // 'folder' | 'zip' while reading
    var _n = useState(0), reading = _n[0], setReading = _n[1];
    var _err = useState(null), err = _err[0], setErr = _err[1];
    var _arm = useState(false), armed = _arm[0], setArmed = _arm[1];
    var _open = useState({}), open = _open[0], setOpen = _open[1];
    var _w = useState(root.innerWidth), vw = _w[0], setVw = _w[1];
    var folderRef = useRef(null), zipRef = useRef(null), winRef = useRef(null);
    if (UI.useBackToClose) UI.useBackToClose(true, props.onClose);
    if (UI.useHoldFocus) UI.useHoldFocus(winRef, true);

    useEffect(function () {
      var alive = true;
      if (ST) ST.ready().then(function (r) { if (alive && r) setReport(r); });
      root.SWRPGRuleTextLoad.open(props.prepare).then(function (l) { if (alive) setLoaded(l); },
        function (e) { console.warn('[ruleText] the records did not load; the pick buttons stay off:', e); });
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); props.onClose(); } }
      function onResize() { setVw(root.innerWidth); }
      document.addEventListener('keydown', onKey, true);
      root.addEventListener('resize', onResize);
      return function () { alive = false; document.removeEventListener('keydown', onKey, true); root.removeEventListener('resize', onResize); };
    }, []);

    // THE IMPORT: read the pick, run the reader, keep the result (a new import replaces the last one)
    function finish(files, name, how) {
      setReading(files.filter(function (f) { return /\.xml$/i.test(f.path); }).length);
      return new Promise(function (res) { setTimeout(res, 0); }).then(function () {
        var out = RT().run(loaded.docs, files, { name: name, glyphs: loaded.glyphs, markup: loaded.markup });
        if (out.report.error === 'no-files') { setErr('NO OGGDUDE FILES IN THAT FOLDER'); return null; }
        return ST.save(out).then(function () { setReport(out.report); setErr(null); setOpen({}); setArmed(false); });
      });
    }
    function pickFolder(fileList) {
      if (!fileList || !fileList.length || !loaded) return;
      var first = String(fileList[0].webkitRelativePath || '').split('/')[0] || 'folder';
      setBusy('folder'); setErr(null);
      readFolder(fileList).then(function (files) { return finish(files, first, 'folder'); })
        .catch(function (e) { console.warn('[ruleText] import failed:', e); setErr('NO OGGDUDE FILES IN THAT FOLDER'); })
        .then(function () { setBusy(null); });
    }
    function pickZip(fileList) {
      var f = fileList && fileList[0];
      if (!f || !loaded) return;
      setBusy('zip'); setErr(null);
      f.arrayBuffer().then(function (buf) { return RT().unzip(buf); })
        .then(function (files) { return finish(files, f.name, 'zip'); }, function (e) {
          console.warn('[ruleText] zip:', e); setErr("THAT ZIP COULDN'T BE OPENED");
        })
        .then(function () { setBusy(null); });
    }

    var wide = vw >= 1024, off = !loaded || !!busy;
    var MONO = { fontFamily: 'var(--font-mono,monospace)', letterSpacing: '.08em', color: 'var(--doc-ink)' };
    var place = wide
      ? { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(560px, calc(100vw - 32px))', maxHeight: '82vh' }
      : { left: 0, right: 0, bottom: 0, maxHeight: '86%' };
    var stale = report && report.stale && report.stale.length;
    var status = busy ? 'READING ' + fmt(reading) + ' FILES…'
      : err ? err
      : stale ? 'RULE TEXT LIST OUT OF DATE — NOTHING FILLED'
      : report ? 'TEXT FROM ' + report.name + ' · ' + fmt(report.filled) + ' FILLED'
      : 'NO IMPORTED TEXT YET — RULE TEXT SHOWS BLANK';

    function fold(id, label, lines) {
      var isOpen = !!open[id];
      return [
        h('button', { key: 'b', type: 'button', className: 'hp-quiet', 'data-role': 'fold', 'data-kind': id, 'aria-expanded': isOpen ? 'true' : 'false',
          onClick: function () { var n = Object.assign({}, open); n[id] = !isOpen; setOpen(n); },
          style: { color: 'var(--doc-ink)', paddingLeft: 12, paddingRight: 14, marginLeft: wide ? 0 : 'auto' } }, (isOpen ? '▾ ' : '▸ ') + label),
        isOpen ? h('div', { key: 'l', 'data-testid': 'rule-text-fold', style: { flexBasis: '100%', margin: '4px 0 2px', padding: '2px 0 2px 12px', borderLeft: '2px solid var(--doc-rule)' } },
          lines.map(function (t, i) { return h('div', { key: i, style: Object.assign({ fontSize: 'calc(14 * var(--u))', lineHeight: 1.7, overflowWrap: 'anywhere' }, MONO) }, t); })) : null,
      ];
    }
    function row(key, name, nums, foldBits) {
      return h('div', { key: key, 'data-testid': 'rule-text-row', 'data-kind': key,
          style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 6, padding: foldBits ? '6px 0' : '4px 0', borderBottom: '1px solid var(--doc-rule)' } },
        h('div', { className: 'sb-e-t', style: { flex: '1 1 auto', minWidth: 0, maxWidth: 'none', margin: 0 } }, name),
        h('div', { style: Object.assign({ fontSize: 'calc(14 * var(--u))', whiteSpace: 'nowrap' }, MONO) }, nums),
        foldBits);
    }
    var body = null;
    if (report && !stale && !busy && !err) {
      var outN = OUTSIDE.reduce(function (s, o) { return s + (report.outside[o[0]] || 0); }, 0);
      body = h('div', { 'data-testid': 'rule-text-report', style: { paddingTop: 12, borderTop: '1px solid var(--doc-rule)', display: 'flex', flexDirection: 'column' } },
        h('p', { className: 'sb-e-t', style: { maxWidth: 'none', margin: '0 0 6px' } }, 'Filled ' + fmt(report.filled) + ' of ' + fmt(report.total) + ' blanks.'),
        report.kinds.map(function (k) {
          var not = k.of - k.filled;
          return row(k.kind, k.kind, h(React.Fragment, null, h('b', null, fmt(k.filled)), '  of ' + fmt(k.of)),
            not ? fold(k.kind, fmt(not) + ' NOT FILLED', k.reasons.map(function (r) { return fmt(r[1]) + ' · ' + r[0]; })) : null);
        }),
        row('outside', 'NOT IN AN OGGDUDE FOLDER', fmt(outN), fold('outside', fmt(outN) + ' NOT FILLED',
          OUTSIDE.map(function (o) { return o[1] + ' ' + fmt(report.outside[o[0]] || 0) + ' · ' + NFMT; }))));
    }

    var win = h('div', {
        ref: winRef, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Rule text', 'data-testid': 'rule-text-paper', 'data-doc-ground': 'creator',
        style: Object.assign({ '--u': '1px', position: 'fixed', zIndex: 4001, display: 'flex', flexDirection: 'column', minHeight: 0,
          background: 'var(--doc-paper)', color: 'var(--doc-ink)', boxShadow: '0 18px 44px rgba(0,0,0,.45), 0 0 0 1px var(--doc-rule)',
          paddingBottom: wide ? 0 : 'env(safe-area-inset-bottom)' }, place) },
      h('div', { style: { flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 16px', borderBottom: '1px solid var(--doc-rule)', background: 'var(--doc-paper-raised)' } },
        h('div', { className: 'sb-e-n', style: { flex: 1, minWidth: 0, fontSize: 'calc(15 * var(--u))', letterSpacing: '.06em', lineHeight: 1.35 } }, 'RULE TEXT'),
        h('button', { type: 'button', className: 'hp-quiet', 'aria-label': 'Close', 'data-role': 'close', onClick: props.onClose,
          style: { minWidth: 44, minHeight: 44, padding: 0, justifyContent: 'center', fontSize: 16, color: 'var(--doc-ink)' } }, '✕')),
      h('div', { 'data-scroll': '1', style: { flex: '1 1 auto', minHeight: 0, overflow: 'auto', padding: '6px 16px 18px', display: 'flex', flexDirection: 'column', gap: 14 } },
        h('div', { 'data-testid': 'rule-text-status', role: err ? 'alert' : undefined,
          style: Object.assign({ fontSize: 'calc(12 * var(--u))', letterSpacing: '.12em', lineHeight: 1.5 }, MONO, { color: report || err ? 'var(--doc-ink)' : 'var(--doc-ink-muted)' }) }, status),
        h('input', { ref: folderRef, type: 'file', multiple: true, style: { display: 'none' }, 'aria-label': 'Import an OggDude folder',
          webkitdirectory: 'true', directory: 'true', onChange: function (e) { pickFolder(e.target.files); e.target.value = ''; } }),
        h('input', { ref: zipRef, type: 'file', accept: '.zip,application/zip', style: { display: 'none' }, 'aria-label': 'Pick a zip',
          onChange: function (e) { pickZip(e.target.files); e.target.value = ''; } }),
        h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' } },
          h('button', { type: 'button', className: 'hp-commit', 'data-role': 'import-folder', 'aria-busy': busy === 'folder' ? 'true' : undefined,
            'aria-disabled': off ? 'true' : undefined, onClick: function () { if (!off && folderRef.current) folderRef.current.click(); } },
            busy === 'folder' ? 'READING…' : 'IMPORT AN OGGDUDE FOLDER'),
          h('button', { type: 'button', className: 'hp-quiet', 'data-role': 'pick-zip', 'aria-busy': busy === 'zip' ? 'true' : undefined,
            'aria-disabled': off ? 'true' : undefined, onClick: function () { if (!off && zipRef.current) zipRef.current.click(); } },
            busy === 'zip' ? 'READING…' : 'PICK A ZIP')),
        body,
        report && !busy ? h('div', { style: { paddingTop: 12, borderTop: '1px solid var(--doc-rule)' } },
          h('button', { type: 'button', className: armed ? 'sb-confirm' : 'hp-quiet', 'data-role': 'remove', 'data-two-tap': armed ? 'armed' : 'idle',
            onClick: function () {
              if (armed) { ST.clear().then(function () { setReport(null); setArmed(false); setErr(null); setOpen({}); }); }
              else setArmed(true);
            } }, armed ? 'TAP AGAIN TO REMOVE IMPORTED TEXT' : 'REMOVE IMPORTED TEXT')) : null));
    return toBody(h(React.Fragment, null,
      h('div', { 'data-testid': 'rule-text-scrim', className: 'hp-scrim', onClick: props.onClose, style: { zIndex: 4000 } }),
      win));
  }

  root.SWRPGRuleTextPanel = { Panel: Panel };
})(typeof window !== 'undefined' ? window : this);

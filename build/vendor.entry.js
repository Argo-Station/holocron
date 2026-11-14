// vendor.entry.js — bundled by esbuild into /vendor.js (the shared runtime chunk, §8b).
//
// React + ReactDOM *production* builds, taken off the CDN and exposed as the same window
// globals the classic-script app code (player/app.js, lib/shared/diceUI) already expects —
// so precompiling changes the delivery, not the code. One /vendor.js is cached once across
// player/gm/dice (BABEL_PRECOMPILE_RECON §8b; HOLOCRON_VISION §4 — the shared chunk is the
// reference-layer's delivery mechanism). build.mjs appends the compiled shared diceUI after
// this bundle, so window.React exists before diceUI runs.
import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import * as ReactDOM from 'react-dom';

window.React = React;
// react-dom (legacy: render/findDOMNode) merged with react-dom/client (createRoot) so the
// app's `ReactDOM.createRoot(...)` resolves exactly as it did against the UMD global.
window.ReactDOM = Object.assign({}, ReactDOM, ReactDOMClient);

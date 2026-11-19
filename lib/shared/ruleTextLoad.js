/* lib/shared/ruleTextLoad.js — A5's LOADER: everything the import reads that is not the user's own files
 * (window.SWRPGRuleTextLoad). Ruling argo-dataset-import-draft ADDENDUM 5 Q2 (a).
 *
 * When the panel opens in the open copy, this asks the shared loaders for our records — the items loader
 * (SWRPGItemRegistries.load, its pristine `_canonicalRegistriesBase`) and sheetPool's charbuild loader (its
 * `_canonicalCharbuildBase`) — and fetches the rest itself: vehicle attachments, crafting, qualities, the vehicle library
 * the glyph table and the markup table (R-ART-5). It also brings in the reader and oggImport.js when they are not on the page. Every fetch is HERE,
 * at panel open; the reader (ruleText.js) and the panel hold none, so G1's runtime count, from the pick to the result,
 * reads 0. The records come back as the docs the reader walks, keyed by their public/data-relative file, exactly the
 * shapes the files have, so the RULE_TEXT_BLANKS walk counts what the export blanked.
 *
 * open(prepare) → Promise<{ docs, glyphs, markup }>; a failed fetch of either table rejects it (R-ART-5). `prepare` (optional) is the host's own core loader, run first (the GM
 * app's ensureYardCharCore, which brings sheetPool and the item loader in).
 */
(function (root) {
  'use strict';

  var BASE = 'public/data/';
  var REST = ['canonical/vehicle-attachments.json', 'canonical/crafting_spend.json', 'canonical/crafting_templates.json',
    'canonical/qualities.vocab.json'];
  // the reader and the key index it joins through (oggImport.js's indexBy and KEY_ALIASES); each injected once, found
  // by its src (the player's own part loader, `prepare`, may already have brought oggImport.js in)
  var SCRIPTS = ['dist/lib/shared/oggImport.js', 'dist/lib/shared/ruleText.js'];   // B-1912 (ADDENDUM 761): the minified copies
  var _open = null;

  function getJson(path) {
    return fetch(path).then(function (r) { if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); });
  }
  function inject(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = '/' + src; s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function scripts() {
    return SCRIPTS.reduce(function (p, src) {
      return p.then(function () { return document.querySelector('script[src$="' + src + '"]') ? null : inject(src); });
    }, Promise.resolve());
  }
  function vehicleFiles() {
    return getJson(BASE + 'vehicle-library/index.json').then(function (ix) {
      var sh = (ix && ix.shards) || {};
      return Object.keys(sh).sort().map(function (k) { return 'vehicle-library/' + sh[k].file; });
    });
  }

  function open(prepare) {
    if (_open) return _open;
    var S = root.SWRPGSources;
    if (!(S && S.bookTextRemoved && S.bookTextRemoved())) return Promise.reject(new Error('rule text: not the open copy'));
    _open = Promise.resolve(typeof prepare === 'function' ? prepare() : null).then(function () {
      var SP = root.SWRPGSheetPool, IR = root.SWRPGItemRegistries;
      var cb = SP && SP.loadCanonicalCharacterBuild ? SP.loadCanonicalCharacterBuild()
        : (typeof root.loadCanonicalCharacterBuild === 'function' ? root.loadCanonicalCharacterBuild() : Promise.reject(new Error('no charbuild loader')));
      return Promise.all([cb, IR.load(), vehicleFiles().then(function (vf) {
        var files = REST.concat(vf);
        return Promise.all(files.map(function (f) { return getJson(BASE + f); })).then(function (r) {
          var out = {}; files.forEach(function (f, i) { out[f] = r[i]; }); return out;
        });
      }), getJson('schema/vocab/glyphs.vocab.json'), getJson('schema/vocab/markup_adjudications.json')]).then(function (r) { return scripts().then(function () { return r; }); });
    }).then(function (r) {
      var cbv = root._canonicalCharbuildBase || r[0] || {}, items = root._canonicalRegistriesBase || {};
      var docs = r[2];
      docs['canonical/talents.json'] = { talents: cbv.talents || {} };
      docs['canonical/force_powers.json'] = { force_powers: cbv.forcePowers || {} };
      docs['canonical/signature_abilities.json'] = { signature_abilities: cbv.signatureAbilities || {} };
      docs['canonical/species.json'] = { species: cbv.species || {} };
      docs['canonical/gear.json'] = { gear: items.gear || {} };
      docs['canonical/weapons.json'] = { weapons: items.weapons || {} };
      docs['canonical/armor.json'] = { armor: items.armor || {} };
      docs['canonical/attachments.json'] = { attachments: items.attachments || {} };
      return { docs: docs, glyphs: r[3], markup: r[4] };
    }).catch(function (e) { _open = null; throw e; });
    return _open;
  }

  var api = { open: open };
  if (root) root.SWRPGRuleTextLoad = api;
})(typeof window !== 'undefined' ? window : this);

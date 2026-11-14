/* lib/library/npc/refData.js — the NPC library's REFERENCE DATA, loaded once for every host (ruling
 * release-r6-companions-lifts Q1 (a); R-R4D-3: lifted out of NpcLibrary's mount effect, never copied).
 *
 * window.SWRPGNpcRefData:
 *   load()                         → Promise<{ canonWeapons, talents, talentsById, skillsVocab, qualities, vehicles }>.
 *                                    Memoized; a failed load REJECTS and clears the memo, so a later mount retries (the
 *                                    effect's old behaviour, where every mount fetched afresh).
 *   loadCanonicalTalents()         the talents registry, fetch-once/cache-on-window (window._canonicalTalents).
 *   canonicalTalentNameIndex(reg)  lowercase name → talent record; an AMBIGUOUS name (two records) is no match.
 *
 * CANONICAL sources only (blob-retirement-2): talents, weapons, the skills and qualities vocabularies, and the
 * vehicle-library shards (weapons baked at build, D-BR3). Loading seeds SWItems' skill-name map from the vocabulary.
 * Plain JS; reads window.CharResolve (buildNameIndex) and window.SWItems at call time. Loaded by both hosts.
 */
(function (root) {
  'use strict';

  function loadCanonicalTalents() {
    if (root._canonicalTalents) return Promise.resolve(root._canonicalTalents);
    if (root._canonicalTalentsPromise) return root._canonicalTalentsPromise;
    root._canonicalTalentsPromise = fetch('public/data/canonical/talents.json')
      .then(function (r) { return r.json(); })
      .then(function (j) { root._canonicalTalents = j.talents; return j.talents; })
      .catch(function (err) { console.warn('[canonical] talents registry load failed:', err); return null; });
    return root._canonicalTalentsPromise;
  }

  // lowercase name -> canonical talent record; AMBIGUOUS names excluded (a name matching more than one record is NO
  // match — the 3b never-guess rule; live homonym: "Temple Training").
  function canonicalTalentNameIndex(reg) {
    if (!reg) return {};
    var idx = root.CharResolve.buildNameIndex(reg);
    var out = {};
    Object.keys(idx.byName).forEach(function (n) {
      var id = idx.byName[n];
      if (typeof id === 'string') out[n] = reg[id];
    });
    return out;
  }

  var memo = null;
  function load() {
    if (memo) return memo;
    memo = Promise.all([
      loadCanonicalTalents(),
      fetch('public/data/canonical/weapons.json').then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch('public/data/canonical/skills.vocab.json').then(function (r) { return r.json(); }),
      fetch('public/data/canonical/qualities.vocab.json').then(function (r) { return r.json(); }),
      fetch('public/data/vehicle-library/index.json').then(function (r) { return r.json(); }),
    ]).then(function (a) {
      var talentReg = a[0], canonW = a[1], skillsVocab = a[2], qualsVocab = a[3], vehIdx = a[4];
      return Promise.all(Object.keys((vehIdx && vehIdx.shards) || {}).map(function (s) {
        return fetch('public/data/vehicle-library/' + s + '.json').then(function (r) { return r.json(); })
          .catch(function () { return { entries: [] }; });
      })).then(function (shardJsons) {
        // Seed the shared skill-name map from the vocab (replaces SWItems.init(raw)).
        if (root.SWItems && root.SWItems.init) root.SWItems.init(skillsVocab);
        var qualitiesByName = {};
        (qualsVocab.entries || []).forEach(function (q) {
          qualitiesByName[q.label.toLowerCase()] = q;
          (q.aliases || []).forEach(function (al) { qualitiesByName[String(al).toLowerCase()] = q; });
        });
        return {
          canonWeapons: (canonW && canonW.weapons) || {},
          talents: canonicalTalentNameIndex(talentReg),
          // ID index for the populated `talent_ref` seam (ruling npc-talent-block-restoration Addendum 1 §C). The NAME
          // index above stays for user-authored customs and the 21 declared gaps — the id is preferred, the heuristics
          // are the fallback.
          talentsById: talentReg || {},
          skillsVocab: skillsVocab.entries || [],
          qualities: qualitiesByName,
          vehicles: shardJsons.reduce(function (acc, j) { return acc.concat(j.entries || []); }, []),
        };
      });
    });
    memo.catch(function () { memo = null; });
    return memo;
  }

  root.SWRPGNpcRefData = { load: load, loadCanonicalTalents: loadCanonicalTalents,
                           canonicalTalentNameIndex: canonicalTalentNameIndex };
})(typeof window !== 'undefined' ? window : globalThis);

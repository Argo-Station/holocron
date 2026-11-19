/**
 * NpcGeneratorController.js — State machine for the NPC Generator hub.
 *
 * Backed by the CANONICAL NPC registry (public/data/canonical/npcs.json) +
 * the affiliations vocab + the npc-landing-layout UI config (ADR 0003
 * world-links-3 — the npc-library/* runtime fetches are RETIRED; those files
 * are build input only). The old archetype-index + per-faction narrative
 * pack machinery has been removed.
 */

// Flat affiliations-vocab entries ({id, label, parent, faction_record}) ->
// the nested drawer tree shape the browser navigates ({id, label, children}).
// Vocab order is preserved (it mirrors the authored drawer order).
function buildAffiliationTree(entries) {
  var byId = {};
  var roots = [];
  entries.forEach(function(e) {
    byId[e.id] = { id: e.id, label: e.label, faction_record: !!e.faction_record, children: [] };
  });
  entries.forEach(function(e) {
    if (e.parent && byId[e.parent]) byId[e.parent].children.push(byId[e.id]);
    else roots.push(byId[e.id]);
  });
  return roots;
}

function npcReducer(state, action) {
  switch (action.type) {
    case 'SET_NPC':
      return action.npc;

    // ── Legacy SET_FIELD (field/value on action root) ──────────────────────
    // Kept for backward compat with old hotspot handler dispatching
    // { type:'SET_FIELD', field:'tier', value:'minion' }
    case 'SET_FIELD':
      var nextSF = Object.assign({}, state);
      // New-style payload object: { field, value }
      if (action.payload && action.payload.field !== undefined) {
        nextSF[action.payload.field] = action.payload.value;
        return nextSF;
      }
      // Legacy root-level field/value
      if (action.field === 'name') nextSF.name = action.value;
      else if (action.field === 'tier') nextSF.tier = action.value;
      else if (action.field === 'faction') nextSF.faction = action.value;
      else if (action.field === 'description') nextSF.description = action.value;
      else if (action.field === 'notes') nextSF.notes = action.value;
      return nextSF;

    case 'SET_CHARACTERISTIC':
      var next2 = Object.assign({}, state);
      next2.characteristics = Object.assign({}, state.characteristics);
      next2.characteristics[action.char] = action.value;
      // Auto-update soak = brawn + armor soak
      if (action.char === 'brawn') {
        next2.derived = Object.assign({}, state.derived);
        var armorSoak = state.equipment.armor ? (state.equipment.armor.soak || 0) : 0;
        next2.derived.soak = action.value + armorSoak;
      }
      return next2;

    case 'SET_DERIVED':
      var next3 = Object.assign({}, state);
      next3.derived = Object.assign({}, state.derived);
      next3.derived[action.field] = action.value;
      return next3;

    case 'SET_SKILL':
      var next4 = Object.assign({}, state);
      next4.skills = Object.assign({}, state.skills);
      if (action.value === null || action.value === undefined) {
        delete next4.skills[action.key];
      } else {
        next4.skills[action.key] = action.value;
      }
      return next4;

    case 'ADD_TALENT':
      var next5 = Object.assign({}, state);
      next5.talents = state.talents.concat([action.talent]);
      return next5;

    case 'REMOVE_TALENT':
      var next6 = Object.assign({}, state);
      next6.talents = state.talents.filter(function(t, i) { return i !== action.index; });
      return next6;

    case 'ADD_ABILITY':
      var next7 = Object.assign({}, state);
      next7.abilities = state.abilities.concat([action.ability]);
      return next7;

    case 'REMOVE_ABILITY':
      var next8 = Object.assign({}, state);
      next8.abilities = state.abilities.filter(function(a, i) { return i !== action.index; });
      return next8;

    // (The disposition case is GONE — B-863, ruling npc-library-paper-concept R-NPC-3: an NPC's
    // disposition is ONE word per NPC in `lib/library/npc/dispositionStore.js`, the only reader and
    // writer. It never lived in this reducer's record again, because it never survived a reload here.)

    // ── Faction lore navigation + figure build: handled in the hook,
    // these cases remain as no-ops for reducer action-type completeness.
    case 'VIEW_FACTION_LORE':
      return state;
    case 'BUILD_NPC_FROM_FIGURE':
      return state;

    case 'SET_SELECTED_FIGURE':
      var nextFig = Object.assign({}, state);
      nextFig.selected_figure = action.payload;
      return nextFig;

    case 'SAVE_CUSTOM_MINION':
      var cm = Object.assign({}, createEmptyNpc(), action.payload);
      cm.libraryKey = null;
      return cm;

    case 'RESET':
      return createEmptyNpc();

    default:
      return state;
  }
}


function useNpcGeneratorController(npcScene) {
  var _React = React;
  var useState = _React.useState;
  var useReducer = _React.useReducer;
  var useCallback = _React.useCallback;
  var useMemo = _React.useMemo;
  var useEffect = _React.useEffect;
  var useRef = _React.useRef;

  var _useReducer = useReducer(npcReducer, null, createEmptyNpc);
  var npc = _useReducer[0];
  var rawDispatch = _useReducer[1];

  var _useState1 = useState(null);    // overlay id: 'minion' | 'rival' | 'nemesis' | 'factionlore' | null
  var overlay = _useState1[0];
  var setOverlay = _useState1[1];

  var _useState2 = useState([]);      // generated NPC history
  var history = _useState2[0];
  var setHistory = _useState2[1];

  // ── Faction lore profiles (public/data/factions/*.json) ──────────────────
  // Still loaded because the Faction Dossier reads them. The NPC library
  // itself is a separate dataset (see libraryByTier + taxonomy below).
  var _useState3 = useState({});
  var factionProfiles = _useState3[0];
  var setFactionProfiles = _useState3[1];

  // ── NPC library state (data-sources/npc-library/*) ────────────────────────
  // libraryByTier: { minion: [entries...], rival: [...], nemesis: [...] }
  // taxonomy: parsed taxonomy.json
  // libraryIndex: parsed index.json (carries affiliation_node_counts)
  var _useStateLib = useState({ minion: [], rival: [], nemesis: [] });
  var libraryByTier = _useStateLib[0];
  var setLibraryByTier = _useStateLib[1];

  var _useStateTax = useState(null);
  var taxonomy = _useStateTax[0];
  var setTaxonomy = _useStateTax[1];

  var _useStateIdx = useState(null);
  var libraryIndex = _useStateIdx[0];
  var setLibraryIndex = _useStateIdx[1];

  // ── B-862 (ruling npc-library-paper-concept, frames A22 · A25) — THE LOAD HAS A FAILURE STATE ──
  // Until this row the registry load below only `console.warn`ed, so a failed fetch left the library
  // on LOADING forever: one frame, two meanings (census §8.1). `loadError` is that second meaning,
  // and `retryLoad` re-runs the SAME three fetches — nothing else is retried. The dark face does not
  // read either (R-NPC-6: its DOM is pinned identical); the paper face draws A25 from them.
  var _useStateErr = useState(null);
  var loadError = _useStateErr[0];
  var setLoadError = _useStateErr[1];
  var _useStateTry = useState(0);
  var loadAttempt = _useStateTry[0];
  var setLoadAttempt = _useStateTry[1];
  var retryLoad = useCallback(function() {
    setLoadError(null);
    setLoadAttempt(function(n) { return n + 1; });
  }, []);

  // ── New state: flow + step navigation ────────────────────────────────────
  var _useState5 = useState(null);     // 'minion' | 'rival' | 'nemesis' | 'factionlore' | null
  var currentFlow = _useState5[0];
  var setCurrentFlow = _useState5[1];

  var _useState6 = useState(0);
  var currentStep = _useState6[0];
  var setCurrentStep = _useState6[1];

  var _useState7 = useState(null);     // faction id for lore detail view
  var activeFactionLore = _useState7[0];
  var setActiveFactionLore = _useState7[1];

  // ── Wrapped dispatch — intercepts special actions ────────────────────────
  var dispatch = useCallback(function(action) {
    if (action.type === 'VIEW_FACTION_LORE') {
      setActiveFactionLore(action.payload);
      setCurrentFlow('factionlore');
      setCurrentStep(1); // detail step
      setOverlay('factionlore');
      return;
    }
    if (action.type === 'SAVE_CUSTOM_MINION') {
      rawDispatch(action);
      setOverlay(null);
      return;
    }
    if (action.type === 'BUILD_NPC_FROM_FIGURE') {
      var figure = action.payload.figure;
      var factionId = action.payload.factionId;
      var suggestedTier = action.payload.suggestedTier || 'nemesis';
      var flowTier = suggestedTier === 'minion_leader' ? 'minion' : suggestedTier;
      var freshNpc = createEmptyNpc();
      freshNpc.name = figure.name || '';
      freshNpc.affiliation = factionId;
      freshNpc.tier = flowTier;
      freshNpc.narrative_role = 'prominent_figure';
      freshNpc.notes = figure.notes || (figure.role || '');
      rawDispatch({ type: 'SET_NPC', npc: freshNpc });
      setCurrentFlow(flowTier);
      setCurrentStep(1);
      setOverlay(flowTier);
      return;
    }
    rawDispatch(action);
  }, [rawDispatch]);

  // ── Load faction profiles (for Faction Dossier) on mount ────────────────
  useEffect(function() {
    // ONE loader for planets and factions (ruling `between-sessions-lap-a-card` §3 item 6): the same records, keyed by id.
    window.SWRPGLore.factions().then(function(profiles) {
      var profileMap = {};
      profiles.forEach(function(p) { profileMap[p.id] = p; });
      setFactionProfiles(profileMap);
    });
  }, []);

  // ── Load the CANONICAL NPC registry on mount (ADR 0003 world-links-3) ─────
  // Replaces the five npc-library/* fetches: entries come from the canonical
  // registry (id-keyed, 19-field records incl. affiliation links), the drawer
  // tree from the affiliations vocab (nested rebuilt from flat parent links),
  // the drawer/shelf arrangement from its own UI-config file (D-WL6 — layout
  // is presentation, not vocabulary), and per-node badge counts are DERIVED
  // from the records (D-WL6 — counts are a view of the data; a baked count is
  // a cache that can drift).
  useEffect(function() {
    Promise.all([
      fetch('public/data/canonical/npcs.json').then(function(r) { return r.json(); }),
      fetch('public/data/canonical/affiliations.vocab.json').then(function(r) { return r.json(); }),
      fetch('public/data/navigation/npc-landing-layout.json').then(function(r) { return r.json(); })
    ]).then(function(results) {
      var reg = results[0].npcs;
      var records = Object.keys(reg).map(function(id) { return reg[id]; });
      var byTier = { minion: [], rival: [], nemesis: [] };
      var counts = {};
      records.forEach(function(n) {
        if (byTier[n.tier]) byTier[n.tier].push(n);
        // unique nodes per record: affiliation + its path (path carries ancestors)
        var seen = {};
        [n.affiliation].concat(n.affiliation_path || []).forEach(function(node) {
          if (node && !seen[node]) { seen[node] = true; counts[node] = (counts[node] || 0) + 1; }
        });
      });
      setLibraryByTier(byTier);
      setLibraryIndex({ affiliation_node_counts: counts, total_entries: records.length });
      setTaxonomy({
        tree: buildAffiliationTree(results[1].entries || []),
        landing_layout: results[2]
      });
    }).catch(function(err) {
      console.warn('[NpcGeneratorController] Failed to load canonical NPC registry:', err);
      setLoadError(String((err && err.message) || err || 'load failed'));
    });
  }, [loadAttempt]);   // B-862: TRY AGAIN bumps the attempt, which is the only thing that re-runs this

  // ── Load NPC from a library entry ────────────────────────────────────────
  var loadFromLibrary = useCallback(function(libraryEntry) {
    var loaded = npcFromLibrary(libraryEntry);
    rawDispatch({ type: 'SET_NPC', npc: loaded });
  }, []);

  // Backwards-compat alias for any remaining callers during migration.
  var loadArchetype = loadFromLibrary;

  // ── Derived: counts per affiliation node (from index.json) ──────────────
  // Used by the UI picker to hide empty nodes.
  var affiliationCounts = useMemo(function() {
    return (libraryIndex && libraryIndex.affiliation_node_counts) || {};
  }, [libraryIndex]);

  // ── Derived: get all NPCs in a given tier + affiliation subtree ─────────
  // An NPC belongs to the subtree rooted at `nodeId` if its
  // affiliation_path contains `nodeId`. This way picking a parent node
  // (e.g. 'galactic_empire') returns all its children's NPCs too.
  var getNpcsByTierAndNode = useCallback(function(tier, nodeId) {
    var pool = libraryByTier[tier] || [];
    if (!nodeId) return pool;
    return pool.filter(function(n) {
      return (n.affiliation_path || []).indexOf(nodeId) !== -1
          || n.affiliation === nodeId;
    });
  }, [libraryByTier]);

  // ── Save current NPC to history ──────────────────────────────────────────
  // Snapshot carries _savedAt (ISO timestamp) so the gm.html history
  // viewer can show "saved N minutes ago". Field is ignored by index.html's
  // older history viewer (extra fields pass through harmlessly).
  var saveToHistory = useCallback(function() {
    if (npc.name || npc.libraryKey) {
      var snapshot = Object.assign({}, npc, { _savedAt: new Date().toISOString() });
      setHistory(function(prev) { return prev.concat([snapshot]); });
    }
  }, [npc]);

  // ── Remove a single saved NPC by index ──────────────────────────────────
  var removeFromHistory = useCallback(function(index) {
    setHistory(function(prev) {
      if (index < 0 || index >= prev.length) return prev;
      return prev.filter(function(_, i) { return i !== index; });
    });
  }, []);

  // ── Clear the entire saved-NPC history ──────────────────────────────────
  var clearHistory = useCallback(function() {
    setHistory([]);
  }, []);

  // ── Reset to empty NPC ───────────────────────────────────────────────────
  var resetNpc = useCallback(function() {
    rawDispatch({ type: 'RESET' });
  }, []);

  // ── Hotspot handling ─────────────────────────────────────────────────────
  var getHotspotState = useCallback(function(hotspot) {
    if (hotspot.kind === 'lore') return 'lore';
    if (hotspot.kind === 'npc-tier') return 'active';
    if (hotspot.flow === 'factionlore') return 'active';
    return 'dim';
  }, []);

  var openNpcStep = useCallback(function(hotspot) {
    if (hotspot.kind === 'npc-tier') {
      rawDispatch({ type: 'SET_FIELD', field: 'tier', value: hotspot.tier });
      setCurrentFlow(hotspot.tier || hotspot.stepId);
      setCurrentStep(0);
      setOverlay(hotspot.stepId);
    } else if (hotspot.flow === 'factionlore') {
      setCurrentFlow('factionlore');
      setCurrentStep(0);
      setOverlay('factionlore');
    }
  }, []);

  var closeOverlay = useCallback(function() {
    setOverlay(null);
    setCurrentFlow(null);
    setCurrentStep(0);
    setActiveFactionLore(null);
  }, []);

  // ── Step navigation ──────────────────────────────────────────────────────
  var nextStep = useCallback(function() {
    setCurrentStep(function(prev) { return prev + 1; });
  }, []);

  var prevStep = useCallback(function() {
    setCurrentStep(function(prev) { return Math.max(0, prev - 1); });
  }, []);

  var setFlow = useCallback(function(flowId) {
    setCurrentFlow(flowId);
    setCurrentStep(0);
    if (flowId) {
      setOverlay(flowId);
    }
  }, []);

  // ── Expose controller interface ──────────────────────────────────────────
  return useMemo(function() {
    return {
      npc: npc,
      dispatch: dispatch,
      overlay: overlay,
      setOverlay: setOverlay,
      history: history,
      loadArchetype: loadArchetype,
      saveToHistory: saveToHistory,
      removeFromHistory: removeFromHistory,
      clearHistory: clearHistory,
      resetNpc: resetNpc,
      getHotspotState: getHotspotState,
      openNpcStep: openNpcStep,
      closeOverlay: closeOverlay,

      // Faction lore (read from public/data/factions/*.json, used by the dossier)
      factionProfiles: factionProfiles,

      // NPC library (read from data-sources/npc-library/*)
      libraryByTier: libraryByTier,
      loadError: loadError,          // B-862: null, or why the registry load failed (A25)
      retryLoad: retryLoad,          // B-862: re-run the registry load's three fetches (A25's TRY AGAIN)
      libraryIndex: libraryIndex,
      taxonomy: taxonomy,
      affiliationCounts: affiliationCounts,
      getNpcsByTierAndNode: getNpcsByTierAndNode,
      loadFromLibrary: loadFromLibrary,

      // Compatibility shim: factionArchetypes is now an empty object.
      // Any legacy callers still reading it will see no data; Chunk B6
      // stubs the dossier's ARCHETYPES section so nothing crashes.
      factionArchetypes: {},

      // New: flow/step navigation
      currentFlow: currentFlow,
      currentStep: currentStep,
      activeFactionLore: activeFactionLore,
      nextStep: nextStep,
      prevStep: prevStep,
      setFlow: setFlow,

      // Compatibility shims for HubSceneRenderer
      character: npc,
      isTwistActive: false,
      selectedLoreId: null,
      completedStepIds: new Set(),
      activeStepId: null,
      orderedCreationSteps: []
    };
  }, [npc, overlay, history, factionProfiles,
      libraryByTier, libraryIndex, taxonomy, affiliationCounts,
      getNpcsByTierAndNode, loadFromLibrary, loadError, retryLoad,
      currentFlow, currentStep, activeFactionLore]);
}

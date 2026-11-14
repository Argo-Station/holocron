/**
 * createEmptyNpc.js — NPC domain model for the NPC Generator.
 * Parallel to createEmptyCharacter.js but simpler (no XP, no obligation/duty/morality).
 */

function createEmptyNpc() {
  return {
    name: '',
    tier: null,               // 'minion' | 'rival' | 'nemesis'
    libraryKey: null,         // stable key from data-sources/npc-library/*.json, null if custom
    affiliation: null,        // affiliation node id (e.g. 'imperial_military', 'hutt_cartel')
    affiliation_path: [],     // e.g. ['galactic_empire','imperial_military']
    source: '',               // human-readable book ('Allies and Adversaries')
    source_code: null,        // e.g. 'aaa'
    source_tags: [],           // original stoogoff tags, preserved for provenance
    description: '',

    characteristics: {
      brawn: 2,
      agility: 2,
      intellect: 2,
      cunning: 2,
      willpower: 2,
      presence: 2
    },

    // Library NPCs use FFG-style flat derived stats: soak/wounds/strain/defense
    derived: {
      soak: 2,
      wounds: 5,
      strain: 0,             // only rival/nemesis have strain
      defense: 0
    },

    // Library NPCs carry skills as a simple list of skill names (strings).
    // Custom NPCs can still use a sparse rank map if needed.
    skills: [],

    // Library NPCs carry talents/abilities as strings (pre-formatted).
    // Array of strings OR array of {name, description} objects.
    talents: [],
    abilities: [],

    // Library NPCs carry gear/weapons as formatted strings, plus a single
    // equipmentDesc string. We keep arrays for future editing.
    equipmentDesc: '',
    weapons: [],
    gear: [],

    // (Disposition tracking LEFT this record at B-863 — ruling npc-library-paper-concept R-NPC-3: it is
    //  one word per NPC in lib/library/npc/dispositionStore.js, keyed by _source_key, on both hosts.)

    // GM-authored per-instance narrative. Kept as empty strings so
    // existing UI bindings that read these fields don't blow up; the
    // fields are no longer populated automatically from a narrative
    // source since the library is pure mechanics.
    wants: '',
    secret: '',
    motivation: '',
    pressure_point: '',
    useful_to_players: [],
    hooks: [],

    // Minion-specific
    group_size: 'small',      // small(2-5) / medium(5-10) / large(10+)
    group_tactics: '',
    scatter_condition: '',

    // Nemesis-specific
    narrative_role: '',
    long_term_goal: '',
    current_scheme: '',
    relationship_to_players: '',

    notes: '',                // GM freeform notes

    // Key figure reference (set when tapping a prominent figure)
    selected_figure: null     // full figure object from faction profile
  };
}

/**
 * Populate an NPC from a CANONICAL registry record (ADR 0003 world-links-3 —
 * formerly an npc-library entry; the copy is shape-agnostic and the canonical
 * record carries the same provenance fields: affiliation_path, source,
 * source_tags). libraryKey keeps the stoogoff origin key (_source_key) so
 * saved-NPC history and v3 encounters keep resolving.
 */
function npcFromLibrary(entry) {
  var npc = createEmptyNpc();
  npc.name = entry.name || '';
  npc.tier = entry.tier || null;
  npc.libraryKey = entry._source_key || entry.key || null;
  npc.affiliation = entry.affiliation || null;
  npc.affiliation_path = (entry.affiliation_path || []).slice();
  npc.source = entry.source || '';
  npc.source_code = entry.source_code || null;
  npc.source_tags = (entry.source_tags || []).slice();
  npc.description = entry.description || '';

  if (entry.characteristics) {
    npc.characteristics = Object.assign({}, entry.characteristics);
  }
  if (entry.derived) {
    npc.derived = Object.assign({}, entry.derived);
  }
  // Library ships skills as array of strings
  npc.skills = Array.isArray(entry.skills) ? entry.skills.slice() : [];
  npc.talents = Array.isArray(entry.talents) ? entry.talents.slice() : [];
  npc.abilities = Array.isArray(entry.abilities) ? entry.abilities.slice() : [];

  npc.equipmentDesc = entry.equipmentDesc || '';
  npc.weapons = Array.isArray(entry.weapons) ? entry.weapons.slice() : [];
  npc.gear = Array.isArray(entry.gear) ? entry.gear.slice() : [];

  return npc;
}


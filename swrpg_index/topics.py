"""Hand-curated topic index — named cross-book pointers.

A topic is the GM saying "show me the canonical rulebook passage for X."
Each entry maps to a list of (alias, section_fragment, priority) tuples.
`section_fragment` is a case-insensitive substring of a real TOC entry title
extracted into `Docs/pdf_toc_index.json` at ingest time. Topics pointing
at aliases without an embedded TOC (holocron, gadgets, ships) fall back to
FTS search within the alias via cmd_topic's fallback path.

Groups:
  Round 1 — mechanics (legacy from pdf_ref.py): core rules the vet cites often.
  Round 2 — GM-craft: adversary design, encounter building, tier ratios, crits.
  Round 3 — table-craft: what a GM asks the rulebook about *while running*
            (attack sequence, starship combat, force powers by tradition,
            motivation/duty/morality as first-class topics, XP awards,
            weapon mods + crafting). Every fragment below was verified against
            the real TOC.
"""

TOPIC_INDEX = {
    # ── Round 1 — core mechanics ────────────────────────────────────────────
    'combat': [
        ('eote',     '6: Conflict and Combat', 10),
        ('aor',      '6: Conflict and Combat', 9),
        ('fad',      '6: Conflict and Combat', 8),
        ('holocron', 'combat',                 7),
    ],
    'actions': [
        ('eote',     'Actions', 10),
        ('aor',      'Actions', 9),
        ('fad',      'Actions', 8),
        ('holocron', 'actions', 7),
    ],
    'maneuvers': [
        ('eote',     'Maneuvers', 10),
        ('aor',      'Maneuvers', 9),
        ('fad',      'Maneuvers', 8),
        ('holocron', 'maneuver',  7),
    ],
    'initiative': [
        ('eote',     'Initiative', 10),
        ('holocron', 'initiative', 7),
    ],
    'wounds': [
        ('eote',     'Wounds, Strain', 10),
        ('aor',      'Wounds, Strain', 9),
        ('fad',      'Wounds, Strain', 8),
        ('holocron', 'wounds',         7),
    ],
    'strain': [
        ('eote',     'Wounds, Strain', 10),
        ('holocron', 'strain',         7),
    ],
    'healing': [
        ('eote',     'Recovery and Healing', 10),
        ('aor',      'Recovery and Healing', 9),
        ('fad',      'Recovery Healing',     8),
    ],
    'soak': [
        ('eote',     'Soak',        10),
        ('aor',      'Soak',        9),
        ('fad',      'Soak',        8),
        ('holocron', 'soak',        7),
    ],
    'critical': [
        ('eote',     'Critical Injury', 10),
        ('aor',      'Critical Injury', 9),
        ('holocron', 'critical',        7),
    ],
    'crit table': [
        ('eote', '6-10: Critical Injury Result', 10),
        ('aor',  '6-10: Critical Injury Result', 9),
        ('fad',  '6-10: Critical Injury Result', 8),
    ],
    'dice': [
        ('eote',     'The Dice', 10),
        ('holocron', 'dice',     7),
    ],
    'skills': [
        ('eote',     '3: Skills', 10),
        ('aor',      '3: Skills', 9),
        ('holocron', 'skills',    7),
    ],
    'talents': [
        ('eote',     '4: Talents', 10),
        ('aor',      '4: Talents', 9),
        ('holocron', 'talents',    7),
    ],
    'weapons': [
        ('eote',     'Weapon Descriptions', 10),
        ('aor',      'Weapon Descriptions', 9),
        ('fad',      'Weapon Descriptions', 8),
        ('gadgets',  'weapon',              7),
    ],
    'weapon qualities': [
        ('eote',     'Weapon Characteristics', 10),
        ('aor',      'Weapon Characteristics', 9),
        ('fad',      'Weapon Characteristics', 8),
        ('holocron', 'qualities',              7),
    ],
    'vehicles': [
        ('eote',     '7: Starships and Vehicles', 10),
        ('aor',      '7: Starships and Vehicles', 9),
        ('fad',      '7: Starships and Vehicles', 8),
    ],
    'character creation': [
        ('eote',     '2: Character Creation', 10),
        ('aor',      '2: Character Creation', 9),
        ('fad',      '2: Character Creation', 8),
    ],
    'experience': [
        ('eote',     'Experience',  10),
        ('aor',      'Experience',  9),
        ('fad',      'Experience',  8),
        ('holocron', 'experience',  7),
    ],
    'social': [
        ('eote',     'Social Skill Interactions', 10),
        ('aor',      'Social Skill Interactions', 9),
        ('fad',      'Social Skill Interactions', 8),
        ('holocron', 'social',                     7),
    ],
    'crafting': [
        ('gadgets',  'craft', 10),
    ],

    # ── Round 1 — narrative mechanics by line ───────────────────────────────
    'obligation':  [('eote', 'Obligation', 10)],
    'duty':        [('aor',  'Duty',       10)],
    'morality':    [('fad',  '2-1: Morality', 10)],
    'motivation':  [
        ('eote', 'Determine Motivation',  10),
        ('aor',  'Determine Motivation',   9),
    ],
    'force':       [('fad',  'The Force',    10), ('holocron', 'force', 7)],
    'force powers':[('fad',  'Force Powers', 10), ('holocron', 'force power', 7)],

    # ── Round 2 — GM-craft (encounter design + adversary ratios) ────────────
    'adversary design': [
        ('eote',     '12: Adversaries', 10),
        ('aor',      '12: Adversaries', 9),
        ('fad',      '12: Adversaries', 8),
    ],
    'encounter building': [
        ('aor',      'Creating Encounters, Adventures, and Campaigns',  10),
        ('fad',      'Creating Encounters, Adventures, and Campaigns',  9),
        ('eote',     '9: The Game Master',                              8),
    ],
    'game master': [
        ('eote',     '9: The Game Master',       10),
        ('aor',      '9: The Game Master',       9),
        ('fad',      '9: The Game Master',       8),
        ('eote-gm',  "Game Master's Kit",        7),
        ('aor-gm',   "Game Master's Kit",        7),
        ('fad-gm',   "Game Master's Kit",        7),
    ],
    'game master rules': [
        ('fad',      'Game Master Rules and Options', 10),
    ],
    'gm guide nemesis': [
        ('eote-gm',  "A GM's Guide to the Nemesis", 10),
    ],
    'nemesis': [
        ('eote',     '12: Adversaries', 10),
        ('aor',      '12: Adversaries', 9),
        ('fad',      '12: Adversaries', 8),
        ('eote-gm',  "A GM's Guide to the Nemesis", 7),
    ],
    'rival': [
        ('eote',     '12: Adversaries', 10),
        ('aor',      '12: Adversaries', 9),
        ('fad',      '12: Adversaries', 8),
    ],
    'minion': [
        ('eote',     '12: Adversaries', 10),
        ('aor',      '12: Adversaries', 9),
        ('fad',      '12: Adversaries', 8),
    ],
    'difficulty': [
        ('eote',     'Difficulty Levels', 10),
        ('aor',      'Difficulty Levels', 9),
        ('fad',      'Difficulty Levels', 8),
    ],
    'destiny': [
        ('eote',     'Destiny', 10),
        ('aor',      'Destiny', 9),
        ('fad',      'Destiny', 8),
    ],
    'spending results': [
        ('eote',     'Spending Success and Triumph in Combat', 10),
        ('aor',      'Spending Results in Combat',             9),
        ('fad',      'Spending Results in Combat',             8),
    ],
    'spending failures': [
        ('eote', 'Spending Failure and Despair in Combat', 10),
    ],
    'cover': [
        ('eote',     'Cover', 10),
        ('aor',      'Cover', 9),
        ('fad',      'Cover', 8),
    ],
    'range bands': [
        ('eote',     'Range Bands', 10),
        ('aor',      'Range Bands', 9),
        ('fad',      'Range Bands', 8),
    ],
    'ranged attack': [
        ('eote',     '6-1: Ranged Attack Difficulties', 10),
        ('aor',      '6-1: Ranged Attack Difficulties', 9),
        ('fad',      '6-1: Ranged Attack Difficulties', 8),
    ],
    'ranged modifiers': [
        ('eote',     'Additional Combat Modifiers', 10),
        ('aor',      'Additional Combat Modifiers', 9),
        ('fad',      'Additional Combat Modifiers', 8),
    ],
    'improvised weapon': [
        ('eote',     '6-5: Improvised Weapons', 10),
        ('aor',      '6-5: Improvised Weapons', 9),
        ('fad',      '6-5: Improvised Weapons', 8),
    ],
    'structured encounter': [
        ('eote',     'Structured',          10),
        ('fad',      'Structured Gameplay', 9),
    ],
    'narrative encounter': [
        ('fad',      'Narrative and Structured Gameplay', 10),
    ],
    'species': [
        ('eote',     'Species', 10),
        ('aor',      'Species', 9),
        ('fad',      'Species', 8),
    ],
    'specialization': [
        ('eote',     'Specialization', 10),
        ('aor',      'Specialization', 9),
        ('fad',      'Specialization', 8),
    ],

    # ── Round 2 — session craft & rewards ───────────────────────────────────
    'xp starting': [
        ('eote', '2-4: Spending Starting Experience', 10),
        ('aor',  '2-4: Spending Starting Experience', 9),
        ('fad',  '2-2: Spending Starting Experience', 8),
    ],
    'xp spending': [
        ('aor',  '9-2: Spending Experience', 10),
        ('fad',  '9-1: Spending Experience', 9),
    ],
    'reward': [
        ('eote',     'Reward', 10),
        ('aor',      'Reward', 9),
        ('fad',      'Reward', 8),
        ('holocron', 'reward', 7),
    ],
    'session structure': [
        ('eote', 'Session', 10),
        ('aor',  'Session', 9),
        ('fad',  'Session', 8),
    ],

    # ── Round 3 — table-craft (what a GM asks while running) ────────────────
    'medical check': [
        ('eote',     '3-2: Medical Check Difficulty', 10),
        ('aor',      '3-3: Medical Check Difficulty', 9),
    ],
    'rarity': [
        ('eote',     '5-2: Rarity Modifiers', 10),
        ('aor',      '5-2: Rarity Modifiers', 9),
        ('fad',      '5-2: Rarity Modifiers', 8),
    ],
    'weapon maintenance': [
        ('eote',     'Weapon Maintenance', 10),
        ('aor',      'Weapon Maintenance', 9),
        ('fad',      'Weapon Maintenance', 8),
    ],
    'repairing gear': [
        ('eote',     '5-4: Repairing Gear', 10),
        ('aor',      '5-4: Repairing Gear', 9),
    ],
    'weapon mods': [
        ('eote',     'Weapon Attachments',          10),
        ('aor',      'Customization and Modifications', 9),
        ('fad',      'Customization and Modifications', 8),
    ],
    'weapon attachments': [
        ('eote',     'Weapon Attachments',          10),
        ('fad',      'Weapon, Lightsaber, and Armor Attachments', 9),
    ],

    # ── Round 3 — starship / vehicle combat ─────────────────────────────────
    'starship combat': [
        ('eote',     'Starship and Vehicle Combat', 10),
        ('aor',      'Starship and Vehicle Combat', 9),
        ('fad',      'Starship and Vehicle Combat', 8),
    ],
    'starship weapons': [
        ('eote',     'Starship and Vehicle Weapons', 10),
        ('aor',      'Starship and Vehicle Weapons', 9),
        ('fad',      'Starship and Vehicle Weapons', 8),
    ],
    'starship crit': [
        ('eote',     '7-9: Critical Hit Result', 10),
        ('aor',      '7-9: Critical Hit Result', 9),
        ('fad',      '7-9: Critical Hit Result', 8),
    ],
    'vehicle mods': [
        ('eote',     'Starship and Vehicle Modifications', 10),
        ('aor',      'Ship and Vehicle Modifications',     9),
        ('fad',      'Ship and Vehicle Modifications',     8),
    ],
    'astrogation': [
        ('eote',     '7-13: Astrogation Modifiers', 10),
        ('aor',      '7-13: Astrogation Modifiers', 9),
    ],
    'squad combat': [
        ('aor-gm',   'Optional Rules: Fighting in Squads and Squadrons', 10),
    ],

    # ── Round 3 — force (FaD-heavy) ─────────────────────────────────────────
    'lightsaber': [
        ('fad',      '5-7: Lightsabers', 10),
        ('fad',      '5-8: Lightsaber Hilts', 9),
        ('guardian', 'Lightsaber',        8),
    ],
    'crafting lightsaber': [
        ('fad-gm',   'Crafting a Lightsaber', 10),
    ],
    'force traditions': [
        ('fad', 'Other Force Traditions', 10),
        ('fad', '11: The Jedi and the Sith', 9),
    ],
    'jedi and sith': [
        ('fad', '11: The Jedi and the Sith', 10),
    ],
    'force users': [
        ('fad', 'Force Users', 10),
    ],
    'holocrons': [
        ('fad', '5-11: Holocrons and Ancient Talismans', 10),
    ],

    # ── Round 3 — GM adjudication ───────────────────────────────────────────
    'conflict points': [
        ('fad', '9-2: Common Conflict Point Penalties', 10),
    ],
    'adjudicating destiny': [
        ('aor', 'Adjucating Destiny Points', 10),  # SIC: typo in AoR TOC
    ],
}


def seed_topics_table(conn):
    """Populate the topics table from TOPIC_INDEX. Idempotent."""
    conn.execute('DELETE FROM topics')
    rows = []
    for name, entries in TOPIC_INDEX.items():
        for alias, frag, priority in entries:
            rows.append((name, alias, frag, priority))
    conn.executemany(
        'INSERT INTO topics (name, alias, section_fragment, priority) VALUES (?, ?, ?, ?)',
        rows,
    )
    return len(rows)

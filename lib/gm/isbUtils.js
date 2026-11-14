// ── isbUtils.js ─────────────────────────────────────────────────────────────
// Pure JS utility module for ISB Dossier UI. No React dependency.
// Exports: window.IsbUtils

(function () {
  'use strict';

  // ── ISB Color Palette ───────────────────────────────────────────────────────
  var ISB = {
    // Backgrounds
    bg_primary:    '#030810',
    bg_secondary:  '#070f1a',
    bg_field:      '#0a1525',
    bg_redacted:   '#0d0d0d',

    // Text
    text_primary:  '#B8D4E8',
    text_secondary:'#7A9BB5',
    text_dim:      '#3D5A72',
    text_warning:  '#FF5C5C',
    text_amber:    '#FFC857',
    text_green:    '#3AFFA0',

    // Structural
    border:        'rgba(184,212,232,0.15)',
    border_strong: 'rgba(184,212,232,0.3)',
    stamp_bg:      'rgba(255,92,92,0.08)',
    stamp_border:  'rgba(255,92,92,0.3)',

    // Classification stamp colors by level
    class_obsidian:   '#B8D4E8',
    class_vermillion: '#FFC857',
    class_void:       '#FF5C5C'
  };

  // ── ISB Typography ──────────────────────────────────────────────────────────
  var ISB_TYPE = {
    heading: "'Orbitron', monospace",
    body:    "'Share Tech Mono', 'Courier New', monospace",
    label:   "'Orbitron', monospace"
  };

  var ISB_SIZE = {
    faction_name: 22,
    section_head: 11,
    body:         12,
    field_label:  9,
    metadata:     9,
    stamp:        10
  };

  // ── Helper: build essence text ──────────────────────────────────────────────
  // Returns a short ISB-voice "essence" string for a faction profile object.
  function buildEssenceText(faction) {
    if (!faction) return '';
    var name = (faction.name || faction.id || 'UNKNOWN').toUpperCase();
    var disposition = faction.current_disposition || faction.disposition || 'UNKNOWN';
    var threat = faction.threat_classification || 'UNCLASSIFIED';
    return name + ' — ' + threat + ' — DISPOSITION: ' + disposition;
  }

  // ── Helper: build texture text ─────────────────────────────────────────────
  // Returns ISB-voice "texture" flavor for a faction, drawn from isb_voice
  // fields if present, otherwise a generic placeholder.
  function buildTextureText(faction) {
    if (!faction) return '';
    if (faction.isb_voice && faction.isb_voice.texture) {
      return faction.isb_voice.texture;
    }
    if (faction.isb_voice && faction.isb_voice.analyst_note) {
      return faction.isb_voice.analyst_note;
    }
    var name = (faction.name || faction.id || 'UNKNOWN').toUpperCase();
    return 'Bureau assessment of ' + name + ' remains under active review. Additional field intelligence required before reclassification.';
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  window.IsbUtils = {
    ISB: ISB,
    ISB_TYPE: ISB_TYPE,
    ISB_SIZE: ISB_SIZE,
    buildEssenceText: buildEssenceText,
    buildTextureText: buildTextureText
  };

})();

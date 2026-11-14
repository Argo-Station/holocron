/**
 * holotable.js — the HOLOTABLE LAUNCH FLAG and its indirection layer (slice 1, Stage A item 6).
 *
 * Ruled by `holotable-substrate` (the slice-1 build card) over the research report's six flag
 * rules. Sibling in shape to `account.js`'s ACCOUNT_UI_ENABLED — deliberately the SAME idiom,
 * because a second flag pattern is a second thing to get wrong (PRAXIS §5's one-core rule applied
 * to mechanism rather than to data).
 *
 * ── THE FLAG ────────────────────────────────────────────────────────────────────────────────
 *
 * DARK. Ships OFF, and the constant below says so in source rather than in a config service, so
 * that "is it on in production?" is answered by reading one line of a file that is in the diff.
 *
 * WHAT IT GATES: every user-reachable HOLOTABLE affordance — the GM's start-table door, the
 * player's join-by-code entry, the shared feed, the room-code display. Slice 1 builds NONE of
 * those (they are Stage B and halt at R-MU1); the flag exists now so the mechanism can land, be
 * deployed dark, and be verified in production before anything is visible.
 *
 * WHAT IT DOES NOT GATE, and this is the half that gets misread later: the room-state STORE, the
 * wire schema, the sync-suspension predicate, and the room Worker's own endpoints. Those are
 * always reachable, exactly as F-34 kept `/api/v1` and `/api/auth` reachable while its UI was
 * dark. A flag that also switched off the mechanism would make the dark period untestable, which
 * defeats the entire point of having one — you would be verifying nothing, in the dark, and
 * calling it a dry run.
 *
 * NEVER REPURPOSED. When HOLOTABLE lights up, this constant flips to `true` and KEEPS ITS NAME
 * and its history, in past tense (`LIT <date>`), the way ACCOUNT_UI_ENABLED did. It does not
 * become "the multiplayer flag" or "the beta flag" for some later feature. A repurposed flag is
 * how a switch ends up gating two unrelated things, and how turning one on turns the other on.
 *
 * ── READ AT RENDER TIME, THROUGH ONE ACCESSOR ───────────────────────────────────────────────
 *
 * `holotableEnabled()` reads the PUBLISHED GLOBAL on every call. It is never captured into a
 * module-scope boolean at load, because a captured value cannot be flipped at runtime — and
 * flipping it at runtime is precisely how the browser suites prove the gate still gates. The
 * value is the same on every call in production; the indirection is what makes the dark state
 * testable rather than merely asserted.
 */
(function (root) {
  'use strict';

  // The flag. DARK — slice 1 deploys the mechanism with nothing user-reachable.
  var HOLOTABLE_ENABLED = false;

  // ── reconnect: exponential backoff with EQUAL JITTER ────────────────────────────────────────
  //
  // Designed and tested in THIS slice rather than deferred, because a reconnect policy added
  // later is added under pressure, after the first outage, to a codebase that already assumes
  // it reconnects instantly.
  //
  // WHY EQUAL JITTER and not the two obvious alternatives:
  //   no jitter   — every client that dropped when the Worker restarted comes back at the same
  //                 millisecond. That is a thundering herd, and it re-creates the outage it is
  //                 retrying against, forever, in lockstep.
  //   full jitter — `rand() * exp` can return ~0, so a client that just failed hammers again
  //                 immediately. It solves the herd by making individuals badly behaved.
  // Equal jitter keeps half the window fixed and randomises the other half, so a delay is always
  // at least exp/2 (never a hammer) and spread across exp/2 (never a herd).
  //
  // `rand` is INJECTABLE — the guard passes a deterministic function. Note this is not a second
  // entropy site in the R-V7S-4 sense: it schedules a socket, it never produces a die face, and
  // nothing it returns is ever scored or transmitted.
  var RECONNECT = {
    baseMs: 500,        // first retry lands in [250, 500] — fast enough to feel like nothing happened
    factor: 2,
    maxMs: 30000,       // the ceiling; beyond half a minute a table has already noticed
    maxAttempts: 0,     // 0 = retry forever. A table left alone should still be connected later.
  };

  function reconnectDelay(attempt, rand) {
    var n = attempt;
    if (typeof n !== 'number' || !isFinite(n) || n < 0) n = 0;
    n = Math.floor(n);
    var exp = RECONNECT.baseMs * Math.pow(RECONNECT.factor, n);
    if (!isFinite(exp) || exp > RECONNECT.maxMs) exp = RECONNECT.maxMs;
    var r = (typeof rand === 'function') ? rand() : Math.random();
    if (typeof r !== 'number' || !isFinite(r)) r = 0;
    if (r < 0) r = 0;
    if (r > 1) r = 1;
    return Math.round(exp / 2 + (exp / 2) * r);
  }

  // ── EVENT IDENTITY (R-REI-1/2) ──────────────────────────────────────────────────────────────
  //
  // Every roll event carries an opaque id from birth, so that a later slice can point back at one
  // ("reroll THAT check"). Ruled before the first dark deploy for one reason: a roll sent without
  // an id is anonymous forever, and the set of such rolls is empty only until the room server
  // first takes traffic.
  //
  // MINTED HERE, NOT IN THE STORE. `roomState.makeRollEvent` is deliberately clock-free and
  // RNG-free — it RECEIVES an id and refuses an event without one. The mint lives at the roll
  // site, which is this module, because the store also serves a SOLO backend the Durable Object
  // never sees: a server-minted id cannot exist for a solo roll, so identity must be born where
  // the roll is born, travelling with its faces.
  //
  // NOT A SECOND ENTROPY SITE (R-V7S-4), for the same reason `reconnectDelay` is not: this names
  // an event, it never produces a die face, and nothing it returns is scored or added up. The
  // one-entropy-site law is about FACES.
  //
  // `rand` is injectable so fixtures and guards are deterministic — a mockup that redraws with a
  // different id on every build cannot be reviewed, and a guard that cannot predict the id cannot
  // assert on it.
  var ID_PREFIX = 'r';
  function newEventId(rand) {
    var r = (typeof rand === 'function') ? rand : Math.random;
    var out = '';
    // 20 base-36 characters. Opaque by construction: no timestamp, no member id, nothing a reader
    // could mistake for meaning, because an id that encodes facts invites code that parses it.
    for (var i = 0; i < 20; i++) {
      var v = r();
      if (typeof v !== 'number' || !isFinite(v) || v < 0 || v >= 1) v = 0;
      out += Math.floor(v * 36).toString(36);
    }
    return ID_PREFIX + '_' + out;
  }

  // ── THE ROOM CODE (R-WRC-1) ─────────────────────────────────────────────────────────────────
  //
  // SIX CHARACTERS FROM A 32-LETTER AMBIGUITY-FREE ALPHABET, MINTED HERE, BY THE CLIENT.
  //
  // Ruled by `holotable-wiring-room-code-and-endpoint` R-WRC-1, answering the flag the substrate
  // left in `room-server/src/index.js`: the canonical format was never a helper's call, because
  // THERE ARE NO ACCOUNTS (R-HT-4) and therefore the code is the only lock on a table. The format
  // IS the security posture, and the posture chosen is ARITHMETIC rather than mechanism:
  //
  //   32^6 = 1,073,741,824 live-table addresses.
  //
  // That is what buys the decision to ship NO RATE LIMITING (R-WRC-1's last clause) — the space
  // is the defense. The alternative shape considered and rejected was the mockup's `TARKIN-9`
  // read as a word-plus-digit format: a few thousand addresses, enumerable in an afternoon, and
  // safe only if the Worker also grows rate limiting nobody had ruled. `TARKIN-9` was never a
  // proposal — the mockup's own source table records it as chosen to match `ROOM_CODE`'s
  // permissive bound and nothing more. Rate limiting is NOT owed here; it is the ONLINE tier's
  // question to revisit, where accounts arrive anyway (R-HT-8).
  //
  // ── WHY THESE 32 AND NOT ANOTHER 32 ─────────────────────────────────────────────────────────
  //
  // A-Z minus `I` and `O`, plus 2-9 (so minus `0` and `1`). The four excluded characters are the
  // two look-alike PAIRS — I/1 and O/0 — and removing BOTH members of each pair is what makes a
  // fold unnecessary: there is no "did they mean O or 0?" to resolve at the join, because neither
  // is legal. A canonicalizer that mapped `0` to `O` would be repairing an ambiguity we simply
  // declined to create, and would silently send a typo to a real other room.
  //
  // The count is deliberately a POWER OF TWO. `Math.floor(rand() * 32)` over a uniform [0,1) is
  // exactly unbiased at 32; at, say, 33 it is not, and a mint with a lopsided alphabet quietly
  // shrinks the space it advertises. The distribution guard asserts this rather than trusting it.
  //
  // NOT A SECOND ENTROPY SITE (R-V7S-4), for the reason `newEventId` records verbatim: this names
  // a room, it never produces a die face, and nothing it returns is scored or added up. The
  // one-entropy-site law is about FACES. `rand` is injectable for the same reason too — a guard
  // that cannot predict the code cannot assert on it.
  var ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 32: A-Z less I,O · 2-9
  var ROOM_CODE_LENGTH = 6;
  var ROOM_CODE_GROUP = 3;    // display only — `K7W-Q4M`. The WIRE never carries the hyphen.

  function newRoomCode(rand) {
    var r = (typeof rand === 'function') ? rand : Math.random;
    var out = '';
    for (var i = 0; i < ROOM_CODE_LENGTH; i++) {
      var v = r();
      if (typeof v !== 'number' || !isFinite(v) || v < 0 || v >= 1) v = 0;
      out += ROOM_CODE_ALPHABET.charAt(Math.floor(v * ROOM_CODE_ALPHABET.length));
    }
    return out;
  }

  // ── THE JOIN PATH CANONICALIZES BEFORE IT VALIDATES (R-WRC-1) ───────────────────────────────
  //
  // `k7w q4m`, `K7W-Q4M` and `k7wq4m` all reach the same room. Someone reads a code out; someone
  // else types what they heard, in whatever case their keyboard felt like, with or without the
  // grouping hyphen they saw on the GM's screen. Refusing any of those would be refusing a
  // correct answer over punctuation.
  //
  // ONLY case and SEPARATORS are normalized. Everything else is left alone so that validation —
  // not this function — is what refuses it: a canonicalizer that stripped arbitrary characters
  // could turn a genuinely wrong code into a legal-looking one and send someone to a real other
  // table. The dash family is included because a phone keyboard or an autocorrect will happily
  // turn a typed hyphen into an en- or em-dash between the two groups.
  var ROOM_CODE_SEPARATORS = /[\s\-\u2010-\u2015\u2212]/g;

  function canonicalizeRoomCode(input) {
    if (input == null) return '';
    return String(input).replace(ROOM_CODE_SEPARATORS, '').toUpperCase();
  }

  // Validation over the CANONICAL form. Deliberately separate from the canonicalizer so the
  // ruled order — canonicalize, THEN validate — is the shape of the code and not just a comment.
  function isRoomCode(code) {
    if (typeof code !== 'string' || code.length !== ROOM_CODE_LENGTH) return false;
    for (var i = 0; i < code.length; i++) {
      if (ROOM_CODE_ALPHABET.indexOf(code.charAt(i)) === -1) return false;
    }
    return true;
  }

  // Display grouping — `K7WQ4M` -> `K7W-Q4M`. R-WRC-1 permits it because reading the code aloud
  // IS the ceremony `RoomCodePanel` was drawn for, and three-and-three is how a person says six
  // characters. Presentation only: a non-canonical string is handed back untouched rather than
  // dressed up, so a bug upstream shows as a wrong-looking code instead of a well-formatted one.
  function formatRoomCode(code) {
    if (!isRoomCode(code)) return typeof code === 'string' ? code : '';
    return code.slice(0, ROOM_CODE_GROUP) + '-' + code.slice(ROOM_CODE_GROUP);
  }

  // The published global — the indirection layer. Plain-script surfaces read this; nothing
  // reads the constant directly.
  root.SWRPGHolotable = { enabled: HOLOTABLE_ENABLED };

  function holotableEnabled() {
    return !!(root.SWRPGHolotable && root.SWRPGHolotable.enabled);
  }

  var API = {
    HOLOTABLE_ENABLED: HOLOTABLE_ENABLED,
    holotableEnabled: holotableEnabled,
    RECONNECT: RECONNECT,
    reconnectDelay: reconnectDelay,
    newEventId: newEventId,
    ID_PREFIX: ID_PREFIX,
    ROOM_CODE_ALPHABET: ROOM_CODE_ALPHABET,
    ROOM_CODE_LENGTH: ROOM_CODE_LENGTH,
    ROOM_CODE_GROUP: ROOM_CODE_GROUP,
    newRoomCode: newRoomCode,
    canonicalizeRoomCode: canonicalizeRoomCode,
    isRoomCode: isRoomCode,
    formatRoomCode: formatRoomCode,
  };

  root.SWRPGHolotableEnabled = holotableEnabled;
  // The room-code helpers ride the EXISTING published object rather than adding a second global —
  // one indirection layer, the same one the flag already uses (PRAXIS §5's one-core rule applied
  // to mechanism). `SWRPGHolotable.enabled` keeps its meaning untouched.
  root.SWRPGHolotable.ROOM_CODE_ALPHABET = ROOM_CODE_ALPHABET;
  root.SWRPGHolotable.ROOM_CODE_LENGTH = ROOM_CODE_LENGTH;
  root.SWRPGHolotable.newRoomCode = newRoomCode;
  root.SWRPGHolotable.canonicalizeRoomCode = canonicalizeRoomCode;
  root.SWRPGHolotable.isRoomCode = isRoomCode;
  root.SWRPGHolotable.formatRoomCode = formatRoomCode;
  root.SWRPGHolotable.newEventId = newEventId;
  root.SWRPGHolotable.reconnectDelay = reconnectDelay;
  root.SWRPGHolotable.RECONNECT = RECONNECT;

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);

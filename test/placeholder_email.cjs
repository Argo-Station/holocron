/**
 * F-34 — guard on the placeholder-email mapper (ADR 0017's privacy law).
 *
 * WHY A GUARD AND NOT A GLANCE: this function is the only thing standing between a provider's real
 * address and our users table, and its failure mode is SILENT by nature — a wrong-but-plausible
 * address still signs a user in. The D1 CHECK constraint catches the suffix case; nothing but this
 * guard catches determinism, collision, or normalisation regressions.
 *
 * Run: node test/placeholder_email.cjs
 */
let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};
const throws = (fn) => { try { fn(); return false; } catch (e) { return true; } };

(async () => {
  const { placeholderEmail, isPlaceholderEmail, PLACEHOLDER_DOMAIN } =
    await import('../worker/placeholderEmail.js');

  console.log('placeholder_email — the synthetic-address contract\n');

  // ── the suffix the database will enforce ───────────────────────────────────
  const g = placeholderEmail('google', '117482900112233445566');
  check('every address lands in the reserved .invalid domain',
    g.endsWith('@placeholder.invalid'), g);
  check('the domain constant matches the CHECK constraint in 0001_c1_auth_schema.sql',
    PLACEHOLDER_DOMAIN === 'placeholder.invalid', PLACEHOLDER_DOMAIN);

  // ── determinism: a returning user must map to the SAME row ─────────────────
  check('same (provider, subject) → identical address, every time',
    placeholderEmail('google', 'abc123') === placeholderEmail('google', 'abc123'));

  // ── separation: the three axes that must never collide ─────────────────────
  check('different subjects on one provider stay distinct',
    placeholderEmail('google', 'a') !== placeholderEmail('google', 'b'));
  check('the same subject on different providers stays distinct',
    placeholderEmail('google', 'a') !== placeholderEmail('discord', 'a'));

  // ── normalisation ──────────────────────────────────────────────────────────
  check('case is folded (providers are inconsistent about it)',
    placeholderEmail('Google', 'ABC') === placeholderEmail('google', 'abc'));
  check('characters illegal in a local part are replaced, not passed through',
    /^[a-z0-9._-]+@placeholder\.invalid$/.test(placeholderEmail('microsoft', 'a b/c:d@e')),
    placeholderEmail('microsoft', 'a b/c:d@e'));

  // ── refusal: the collision cases must fail LOUDLY, never silently share ────
  check('an empty subject is refused (would collide every such user onto one row)',
    throws(() => placeholderEmail('google', '')));
  check('a whitespace-only subject is refused', throws(() => placeholderEmail('google', '   ')));
  check('a subject of only illegal characters is refused',
    throws(() => placeholderEmail('google', '@@@')));
  check('an empty provider is refused', throws(() => placeholderEmail('', 'abc')));

  // ── the adversarial matrix ─────────────────────────────────────────────────
  // Run against BOTH enforcement points: the JS predicate AND the real CHECK constraint from the
  // migration. They encode the same law, so they must agree — if someone tightens one and forgets
  // the other, this table goes red. Cases marked `false` must be REFUSED by both.
  //
  // Provenance: rows 6-8 are the architect's (ruling `f34-credential-free-build` F4, which caught
  // that the original suffix-only check was far weaker than the gate claimed); row 8 is the
  // underscore-bearing variant found while verifying their proposed fix, which their GLOB alone
  // admitted — it is why the constraint carries a second clause.
  const MATRIX = [
    ['google_12345@placeholder.invalid',                                  true,  'legitimate google id'],
    ['discord_987654321098765432@placeholder.invalid',                    true,  'legitimate discord snowflake'],
    ['microsoft_00000000-0000-0000-0000-0000000000ab@placeholder.invalid', true, 'legitimate MS uuid (dashes)'],
    ['someone@gmail.com',                                                 false, 'a real address'],
    ['a@placeholder.invalid.example.com',                                 false, 'suffix-spoof domain'],
    ['x@PLACEHOLDER.INVALID',                                             false, 'case variant'],
    ['a@b.com#@placeholder.invalid',                                      false, 'embedded real address'],
    ['a_b@evil.com#@placeholder.invalid',                                 false, 'embedded address WITH underscore'],
  ];

  for (const [email, want, desc] of MATRIX) {
    check('predicate ' + (want ? 'accepts' : 'REFUSES') + ': ' + desc,
      isPlaceholderEmail(email) === want, email);
  }

  check('isPlaceholderEmail rejects non-strings',
    !isPlaceholderEmail(null) && !isPlaceholderEmail(undefined));

  // The one case NOTHING pattern-based can catch — asserted so the limit stays documented in
  // executable form rather than only in prose. If this ever starts failing, someone found a way
  // and the honest-limit comments in the mapper + migration need updating.
  check('KNOWN LIMIT: an email passed as the SUBJECT is shape-identical and DOES pass',
    isPlaceholderEmail(placeholderEmail('google', 'jason@gmail.com')),
    placeholderEmail('google', 'jason@gmail.com'));

  // ── the same matrix, against the REAL migration ────────────────────────────
  const { DatabaseSync } = require('node:sqlite');
  const fs = require('fs'), path = require('path');
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/0001_c1_auth_schema.sql'), 'utf8');
  const db = new DatabaseSync(':memory:');
  db.exec(sql);
  const insert = (email) => {
    try {
      db.prepare('INSERT INTO "user" (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)')
        .run(email, 'n', email, 0, 1, 1);
      return true;
    } catch (e) { return false; }
  };
  for (const [email, want, desc] of MATRIX) {
    check('D1 CHECK ' + (want ? 'accepts' : 'REFUSES') + ': ' + desc, insert(email) === want, email);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();

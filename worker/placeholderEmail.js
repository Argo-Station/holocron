// F-34 — the placeholder-email mapper. ADR 0017 (privacy), scope ruling amendment A2.
//
// WHY THIS EXISTS: better-auth REQUIRES an email column on its user model and it cannot be omitted.
// The product's law is "nothing identity-valuable to breach", so the column is populated with a
// SYNTHETIC address derived only from the provider name and the provider's opaque subject id —
// never from anything the provider says about the human.
//
// `.invalid` is reserved by RFC 2606 and can never resolve to a real domain, so these addresses are
// permanently undeliverable and worthless to an attacker. The D1 CHECK constraint in
// migrations/0001_c1_auth_schema.sql refuses anything that does not end in the suffix, so this
// function's correctness is enforced by the database rather than trusted.
//
// DETERMINISTIC BY CONTRACT: the same (provider, subject) must always produce the same address, or
// a returning user would fail the unique constraint / be seen as a new account. No randomness, no
// clock, no hashing with a rotating salt.

export const PLACEHOLDER_DOMAIN = 'placeholder.invalid';

// The provider's subject is UNTRUSTED input crossing into our storage. Provider ids are opaque
// strings (Google `sub` digits, Discord snowflakes, Microsoft `oid` uuids) — we normalise to a
// conservative local-part alphabet rather than assume that stays true.
const SAFE = /[^a-z0-9._-]+/g;

const normalise = (part) => String(part).toLowerCase().replace(SAFE, '-').replace(/^-+|-+$/g, '');

/**
 * Build the synthetic address for a provider account.
 * @param {string} providerId  e.g. 'google' | 'discord' | 'microsoft'
 * @param {string} subject     the provider's opaque account id (NOT an email, NOT a display name)
 * @returns {string} `<provider>_<subject>@placeholder.invalid`
 */
export function placeholderEmail(providerId, subject) {
  const p = normalise(providerId);
  const s = normalise(subject);
  // Empty either side would collide every such user onto one address — a correctness AND a privacy
  // failure (two people sharing an account). Refuse loudly; the sign-in fails, nothing is stored.
  if (!p) throw new Error('placeholderEmail: providerId is empty after normalisation');
  if (!s) throw new Error('placeholderEmail: provider subject is empty after normalisation');
  return `${p}_${s}@${PLACEHOLDER_DOMAIN}`;
}

// The SHAPE this module produces, as a pattern. Deliberately the same contract the D1 CHECK
// constraint enforces (migrations/0001_c1_auth_schema.sql) — one law, two enforcement points. If
// you change one, the matrix in test/placeholder_email.cjs fails until you change the other.
const SHAPE = /^[a-z0-9._-]+_[a-z0-9._-]+@placeholder\.invalid$/;

/**
 * The dump assert's predicate: is this address one of ours?
 *
 * Tests SHAPE, not merely the suffix (ruling F4 / R-F34-3). A plain `endsWith` check accepts
 * `a@b.com#@placeholder.invalid` — a real address smuggled in ahead of a legitimate-looking tail —
 * and that is exactly what a zero-PII assert must not wave through.
 *
 * HONEST LIMIT: an address passed as the SUBJECT (`google_jason-gmail.com@placeholder.invalid`) is
 * shape-identical to a legitimate opaque id and passes here. Nothing pattern-based can catch it;
 * the mapper's contract is what prevents it.
 */
export function isPlaceholderEmail(email) {
  return typeof email === 'string' && SHAPE.test(email);
}

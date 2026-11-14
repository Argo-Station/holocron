/**
 * F-34 — guard on OAuth scope minimisation (ADR 0017's "read-never" privacy law, layer 1).
 *
 * WHY THIS GUARD EXISTS, SPECIFICALLY: better-auth's built-in Google and Microsoft providers request
 * the `email` scope BY DEFAULT. Measured on 2026-07-25 at the 1.6.25 pin, before this was configured,
 * Google's authorize URL asked for "email profile openid". That default is precisely what would make
 * the product's privacy claim false — not by storing an address, but by RECEIVING one.
 *
 * The defence is `disableDefaultScope: true` + an explicit scope list that omits email. It is one
 * line per provider, it is invisible in a diff if dropped, and NOTHING ELSE FAILS if it regresses —
 * sign-in keeps working, the placeholder mapper keeps writing synthetic addresses, the CHECK
 * constraint stays green. Only the promise quietly stops being true. That is the exact silent-defect
 * class this repo has been burned by, so it gets a guard rather than a comment.
 *
 * Run: node test/auth_scope_minimisation.cjs
 */
let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

const STUB_ENV = {
  DB: { batch() {}, exec() {}, prepare() {} },     // structurally a D1Database; never queried here
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'https://example.invalid',
  GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret',
  MICROSOFT_CLIENT_ID: 'id', MICROSOFT_CLIENT_SECRET: 'secret',
  DISCORD_CLIENT_ID: 'id', DISCORD_CLIENT_SECRET: 'secret',
};

const mentionsEmail = (scopes) =>
  (scopes || []).some((s) => String(s).toLowerCase().split(/[\s,]+/).includes('email'));

(async () => {
  const { createAuth } = await import('../worker/auth.js');
  console.log('auth_scope_minimisation — no provider is ever asked for an email\n');

  const auth = createAuth(STUB_ENV);
  const social = auth.options.socialProviders || {};

  for (const name of ['google', 'microsoft']) {
    const p = social[name];
    check(name + ': configured at all', !!p);
    if (!p) continue;
    check(name + ': disableDefaultScope is ON (better-auth would otherwise add `email`)',
      p.disableDefaultScope === true, p.disableDefaultScope);
    check(name + ': the explicit scope list does NOT contain `email`', !mentionsEmail(p.scope), p.scope);
    check(name + ': still asks for `openid` (the subject id is the one thing we need)',
      (p.scope || []).includes('openid'), p.scope);
  }

  // Discord rides generic-oauth precisely so it can be asked for `identify` alone.
  const generic = (auth.options.plugins || []).find((pl) => pl.id === 'generic-oauth');
  check('discord: the generic-oauth plugin is mounted', !!generic);
  const discord = generic && (generic.options?.config || []).find((c) => c.providerId === 'discord');
  check('discord: configured through generic-oauth', !!discord);
  if (discord) {
    check('discord: scopes are EXACTLY ["identify"] — no email, no profile padding',
      Array.isArray(discord.scopes) && discord.scopes.length === 1 && discord.scopes[0] === 'identify',
      discord.scopes);
  }

  // Belt and braces: the mapper must be wired on every provider, so layer 2 holds even if a future
  // provider is added with a careless scope list.
  for (const name of ['google', 'microsoft']) {
    check(name + ': the placeholder mapper is wired (layer 2)',
      typeof social[name]?.mapProfileToUser === 'function');
  }
  check('discord: the placeholder mapper is wired (layer 2)',
    typeof discord?.mapProfileToUser === 'function');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

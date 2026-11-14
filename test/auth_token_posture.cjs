/**
 * F-34 — guard on the OAuth token posture (ruling `f34-phase0-close-request` D3 + D4).
 *
 * WHAT THIS PROTECTS: we do not persist provider access/refresh/id tokens. They have no function in
 * this product — OAuth gives us a stable subject id at sign-in and we never call a provider API
 * afterwards — so storing them is pure breach liability under ADR 0017's "nothing identity-valuable
 * to breach".
 *
 * WHY A GUARD RATHER THAN A COMMENT, twice over:
 *  1. `encryptOAuthTokens` is NECESSARY BUT NOT SUFFICIENT. Read at source in
 *     `oauth2/link-account.mjs`, all three write sites encrypt accessToken and refreshToken but write
 *     `idToken` RAW — and the id_token is the one carrying given_name/family_name. Anyone who deletes
 *     the hooks and keeps the encryption flag will believe they are covered and will not be.
 *  2. The create and update hooks must BOTH exist. `updateAccountOnSignIn` refills these columns on
 *     every re-auth, so a null-out on create alone is silently undone by the user's second sign-in —
 *     a defect that looks exactly like success until someone dumps the table months later.
 *
 * These are config-level asserts; the live proof is a real sign-in with a table dump (C3 §2).
 *
 * Run: node test/auth_token_posture.cjs
 */
let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
};

const STUB_ENV = {
  DB: { batch() {}, exec() {}, prepare() {} },
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'https://example.invalid',
  GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret',
  MICROSOFT_CLIENT_ID: 'id', MICROSOFT_CLIENT_SECRET: 'secret',
  DISCORD_CLIENT_ID: 'id', DISCORD_CLIENT_SECRET: 'secret',
};

// What a provider hands us on sign-in, in the shape better-auth writes to `account`.
const INCOMING = {
  id: 'acc_1', accountId: '100000000000000000001', providerId: 'google', userId: 'u_1',
  accessToken: 'ya29.REAL_ACCESS_TOKEN',
  refreshToken: '1//REAL_REFRESH_TOKEN',
  idToken: 'eyJhbGciOiJSUzI1NiJ9.eyJnaXZlbl9uYW1lIjoiSmFzb24ifQ.sig',
  scope: 'openid profile',
};

(async () => {
  const { createAuth } = await import('../worker/auth.js');
  console.log('auth_token_posture — provider tokens are never persisted\n');

  const auth = createAuth(STUB_ENV);
  const opts = auth.options;

  check('encryptOAuthTokens is ON (layer 1 — access/refresh at rest)',
    opts.account?.encryptOAuthTokens === true, opts.account?.encryptOAuthTokens);

  const hooks = opts.databaseHooks?.account;
  check('a databaseHooks.account.create.before hook exists', typeof hooks?.create?.before === 'function');
  check('a databaseHooks.account.update.before hook exists (re-auth refills otherwise)',
    typeof hooks?.update?.before === 'function');

  // Behavioural: run the hooks and inspect what would actually be written.
  for (const path of ['create', 'update']) {
    const hook = hooks?.[path]?.before;
    if (typeof hook !== 'function') continue;
    const out = await hook({ ...INCOMING }, null);
    const data = out && out.data;
    check(path + ': the hook returns replacement data', !!data, out);
    if (!data) continue;
    for (const col of ['accessToken', 'refreshToken', 'idToken']) {
      check(path + ': ' + col + ' is nulled', data[col] === null, data[col]);
    }
    // The account must still be usable — nulling the tokens must not strip its identity.
    check(path + ': the account still carries providerId + accountId (identity survives)',
      data.providerId === 'google' && data.accountId === INCOMING.accountId,
      { providerId: data.providerId, accountId: data.accountId });
  }

  // The id_token is the one encryption provably does NOT cover, so call it out by name.
  const created = (await hooks.create.before({ ...INCOMING }, null))?.data;
  check('THE ONE ENCRYPTION MISSES: idToken never reaches the database',
    created?.idToken === null && !JSON.stringify(created).includes('eyJhbGciOiJSUzI1NiJ9'),
    created?.idToken);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

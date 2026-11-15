/* lib/shared/siteSettings.js — your deployment's account values, all blank by default.
 *
 * Five consumers read these values: the analytics beacon (lib/shared/analytics.js), the room client
 * (lib/shared/roomClient.js), the table session (lib/shared/tableSession.js), the sign-in worker's trusted
 * origin (worker/auth.js) and the tip link (index.html, gm/app.jsx). Blank, the app runs with each of them off:
 *   ANALYTICS_TOKEN ''  — no traffic measurement;
 *   ROOM_SERVER_HOST '' — joining a shared table refuses (`no_room_server`); deploy room-server/ and put
 *                         its host here to turn it on;
 *   TABLE_SERVER_HOST ''— the campaigns table: OPEN TABLE, JOIN and the listing read as unreachable; deploy
 *                         table-server/ and put its host here to turn it on;
 *   AUTH_ORIGIN ''      — the sign-in worker trusts only its BETTER_AUTH_URL binding (wrangler.example.toml);
 *   KOFI_URL ''         — no tip link;
 *   BOOK_CONTENT 'removed' — this copy carries none of the books' words and none of FFG's sheet PDFs: the app
 *                         shows a book and page where the words were, asks you for your own sheet PDF, and
 *                         applies a rule whose words were removed exactly as if they were there.
 *
 * Loaded three ways, so it stays a classic script with no dependencies: a plain <script> in every page
 * before analytics.js (window.SWRPGSiteSettings), `require` in the node tests, and an esbuild import from
 * worker/auth.js. Test: test/site_settings.cjs.
 */
(function (root) {
  'use strict';
  var SETTINGS = Object.freeze({
    ANALYTICS_TOKEN: '',
    PRODUCTION_HOSTS: Object.freeze([]),
    ROOM_SERVER_HOST: '',
    TABLE_SERVER_HOST: '',
    AUTH_ORIGIN: '',
    KOFI_URL: '',
    BOOK_CONTENT: 'removed',
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = SETTINGS;
  else if (root) root.SWRPGSiteSettings = SETTINGS;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));

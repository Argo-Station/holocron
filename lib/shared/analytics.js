/* lib/shared/analytics.js — Cloudflare Web Analytics for the production host only (holocron.work's values in siteSettings.js).
 *
 * ONE place holds the rule for when the beacon fires (the token itself is siteSettings.js's); every shell the site serves
 * (/, /player, /gm, /dice, /account) loads this file and nothing else about analytics. Before
 * 2026-09-22 each app shell carried its own copy of the beacon tag, the landing and account shells
 * carried none, and the tag fired from every host — local dev servers and the Playwright smokes
 * (localhost, 127.0.0.1) plus Pages preview hosts were 57% of all page loads measured in the 30 days
 * to 2026-09-22. None of those are users, and they swamped the trend.
 *
 * The beacon reads its config from `document.currentScript`, falling back to
 * `querySelector('script[data-cf-beacon]')` (read from beacon.min.js on 2026-09-22), so a tag this
 * file appends at runtime is a supported install. Pure internals: nothing a visitor sees or reaches
 * changes. Guard: test/analytics_beacon.cjs (loads this file in node and proves every gate below).
 */
(function () {
  // The token and the hosts are account values, read from lib/shared/siteSettings.js (R-AAC-19), which every
  // shell loads before this file. A blank token, or no settings at all, measures nothing.
  var SETTINGS = (typeof module !== 'undefined' && module.exports) ? require('./siteSettings.js')
    : ((typeof window !== 'undefined' && window.SWRPGSiteSettings) || {});
  var SITE_TOKEN = SETTINGS.ANALYTICS_TOKEN || '';
  var PRODUCTION_HOSTS = (SETTINGS.PRODUCTION_HOSTS || []).slice();
  var BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';

  var OPT_OUT_KEY = 'swrpg_analytics_optout'; // localStorage '1' on a device = never count this device

  // The three reasons a page load is NOT a user, each checked in one place:
  //   host      — anything but the production host (local servers, smokes, Pages previews);
  //   webdriver — a browser driven by automation (Playwright sets navigator.webdriver = true), so a
  //               production check or a smoke pointed at holocron.work cannot count as visitors
  //               (2026-08-04 recorded 1,170 "visits" in a day, all direct desktop entries to
  //               /player/, one of them /player/sheet/prodcheck — a check, not an audience);
  //   opt-out   — a device Jason or a seat has marked with the localStorage key, so the team's own
  //               use of the live site is out of the numbers.
  function shouldMeasure(hostname, nav, storage) {
    if (!SITE_TOKEN) return false;
    if (PRODUCTION_HOSTS.indexOf(hostname) === -1) return false;
    if (nav && nav.webdriver === true) return false;
    try { if (storage && storage.getItem(OPT_OUT_KEY) === '1') return false; } catch (e) { /* storage blocked: measure */ }
    return true;
  }

  // Returns true when a beacon tag was appended, false when the load is not a user or a tag is
  // already present (never measure a page twice).
  function install(doc, loc, nav, storage) {
    if (!loc || !shouldMeasure(loc.hostname, nav, storage)) return false;
    if (doc.querySelector('script[data-cf-beacon]')) return false;
    var s = doc.createElement('script');
    s.defer = true;
    s.src = BEACON_SRC;
    s.setAttribute('data-cf-beacon', JSON.stringify({ token: SITE_TOKEN }));
    (doc.head || doc.documentElement).appendChild(s);
    return true;
  }

  var api = { SITE_TOKEN: SITE_TOKEN, PRODUCTION_HOSTS: PRODUCTION_HOSTS, BEACON_SRC: BEACON_SRC, OPT_OUT_KEY: OPT_OUT_KEY, shouldMeasure: shouldMeasure, install: install };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (typeof window !== 'undefined') {
    window.SWRPGAnalytics = api;
    var storage = null; try { storage = window.localStorage; } catch (e) { /* blocked: measure */ }
    install(document, window.location, window.navigator, storage);
  }
})();

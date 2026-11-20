# Start here

This page is for anyone who wants to set up, run, test or release this code without asking anyone, a person or
an AI agent. `README.md` is the front page and says what the project is; this page does not repeat it.

This is the source of Holocron 1.1.10, released on 19 November 2026; the workshop where it was built is private.

## 1. What it is

Holocron is a set of web apps (a character creator and sheet, a GM board, a dice roller) built from `.jsx` sources
into plain files that any static web server can serve. A small Python server runs it on your own computer. A
separate program wraps the same site for Mac and Windows so a table can play on one Wi-Fi without the internet.

## 2. A machine from nothing

Every command on this page was run on **macOS 26.4 on an Apple silicon Mac**, in a fresh clone of this repository,
with no GitHub or Cloudflare sign-in. Nothing on this page was run on Windows or Linux.

You need:

- **Git.** Not only for cloning: `npm run build` asks git for the commit it built from and writes it into
  `version.json` (outside a git checkout it writes `unknown`), and `program/build.mjs` needs git to run at all.
- **Node.js 22 or later, with npm.** Proven with Node 26.0.0 and npm 11.12.1. `wrangler` 4.114, a development tool
  here, requires Node 22 or later.
- **Python 3**, only for the local server (`serve.py`) and the rules search engine. Proven with Python 3.14.4.
  `serve.py` needs nothing beyond Python itself.

Then, in the repository's folder:

```sh
npm ci
```

That installs exactly the versions in `package-lock.json`: esbuild, React, wrangler and better-auth. It ends with
npm's audit count; at 1.1.10 that reads `8 vulnerabilities (2 low, 5 high, 1 critical)`. That is expected. Do not
run `npm audit fix`: it rewrites `package-lock.json`, and the versions on this page are the ones it pins.

**Optional: the rules search engine** (`swrpg_index/`). It searches rulebook PDFs **you own**. Its Python packages
are in `requirements.txt`:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

The install is large and slow: `sentence-transformers` brings in PyTorch, and the `.venv` folder ends near 1.1 GB.
Any warnings pip prints about its cache are harmless.

Building an index from your PDFs also needs PyMuPDF, which is licensed AGPL-3.0. It is not part of this project and
is not installed for you. Install it yourself (`.venv/bin/pip install PyMuPDF`) only if you accept its licence. Section 7
says what else the search engine needs.

## 3. Run

**The site.** The browser runs built files, not the `.jsx` sources. Build first, then serve:

```sh
npm run build
python3 serve.py          # http://localhost:3000
python3 serve.py 8080     # or any port you name
```

`serve.py` runs in the foreground; Ctrl-C stops it, and Python prints a traceback ending `KeyboardInterrupt`, which is
normal. `npm run build` prints one warning, which is expected:
`▲ [WARNING] Duplicate key "onInspect" in object literal [duplicate-object-key]`, then `1 warning`.

The apps are at `/player/`, `/gm/` and `/dice/`. After you change a `.jsx` file, run `npm run build` again, or
leave `npm run watch` running. A page that looks unchanged after an edit usually means the build did not run.

The browser console shows some missing files (404): the symbol fonts, the dice sounds and the species portrait list.
That is expected. This copy ships without them, and the app shows its fallbacks. `BRING_YOUR_OWN_ART.md` says
where your own files go.

`serve.py` saves a GM's own pregens and Quick Build roles in a `gm_data/` folder, made the first time it saves one.

**The program** (`program/`), the download for Mac and Windows. To run it, use the downloads on this repository's
release page; `GUIDE.md` walks through the first start on each system. It cannot be built from this copy as it
stands: see sections 5 and 7.

## 4. Test

```sh
npm run build
npm test
```

`npm test` runs every guard in `test/`, one file at a time. For a guard that passes it prints only `ok` and the
file's name; at the end it prints `N of N guards pass`, then the last lines of each guard that failed. Build first: several
guards read the built files, and they fail without them. To run only some guards, name a word in their file names:
`node scripts/run_tests.cjs room_client`.

At 1.1.10, in a fresh clone with nothing added, **all 321 guards pass** (about 80 seconds). One of them,
`test/deploy_shape.cjs`, skips one check and passes; that is expected until you make a `wrangler.toml` of your own
(section 5). `npm test` does not show the skip; `node test/deploy_shape.cjs` does:
`SKIP  no wrangler.toml in the tree (dashboard-configured; nothing to assert)`.

None of the guards need the files this copy leaves out (the art, the fonts, a rules index of your own).

## 5. Release

**The version.** `package.json`'s `version` is the one version number. `npm run build` writes it into
`version.json`, the program's build scripts stamp it into the program, and the dataset tag must match it.

**The change log.** Each version has a page `public/changelog-<version>.txt` written for players, and a line at the
top of `public/changelogs/index.html` that links to it. Copy the newest page's layout.

**Before you release:** `npm ci && npm run build && npm test`, with every guard passing.

**The dataset release.** `.github/workflows/dataset-release.yml` publishes `public/data/`, `schema/` and `dataset/`
as `holocron-dataset-<version>.zip` with a `SHA256SUMS` file. It runs when you push a tag named
`dataset-v<version>` (it refuses a tag that does not match `package.json`), or by hand from your repository's
Actions page, as a draft or not. Its release notes are `dataset/RELEASE_NOTES.md`, with `{version}` filled in.

**The program downloads.** These are the scripts this copy carries:

- `program/build.mjs` builds the program's site and server into `program/out/`. Its first step runs an export
  script that is not in this copy, so it stops there (`REFUSED at export`).
- `program/mac/build.mjs` builds `Holocron.app` from `program/out/` on a Mac, unsigned.
- `program/windows/build.mjs` builds the Windows `Holocron` folder from `program/out/`. It runs on a Windows PC,
  where Windows' own .NET Framework `csc.exe` compiles the launcher; nothing else is installed. On a Mac,
  `--check` only compiles, with a Roslyn compiler you put in `program/windows/.tools/` yourself.
- `program/windows/icons.mjs` and `program/windows/pack.mjs` make the Windows icons and a bundle to carry to the PC.

No script here zips the downloads or writes their release notes, and the program's release-notes template is not
in this copy. The downloads were named `Holocron-<version>-mac-apple-silicon.zip` and
`Holocron-<version>-windows.zip` (`GUIDE.md`).

**Deploying a copy of your own.** This needs a Cloudflare account (section 8).

- **The site and sign-in:** Cloudflare Pages, with `_worker.js` (built by `npm run build`) as the sign-in worker.
  Copy `wrangler.example.toml` to `wrangler.toml` and fill it in. `npx wrangler d1 create your_auth_db` prints the
  database id it asks for; `migrations/` holds the database's tables. Set the secrets with
  `npx wrangler pages secret put <NAME>`.
- **The room server** (`room-server/`, for joining a shared table) and **the table server** (`table-server/`, for
  campaigns) each deploy on their own, from their own folder: `npx wrangler deploy`. Each has its own
  `wrangler.jsonc`. To check one builds without publishing anything: `npx wrangler deploy --dry-run`. A pass lists
  its bindings under `Your Worker has access to the following bindings:` and ends `--dry-run: exiting now.` Both
  pass at 1.1.10, with no sign-in. wrangler may also print `update available …`. That is harmless; don't update it,
  because `package-lock.json` pins wrangler.
- Then put your hosts in `lib/shared/siteSettings.js` (section 8) and run `npm run build` again.

## 6. Where everything lives

- `player/`, `gm/`, `dice/`, `account/`: the apps' pages and their `.jsx` sources.
- `lib/`: the code the apps share: rules, dice, the stores, the library, the editor.
- `public/`: what the browser loads: the data (`public/data/`), fonts, icons, the change log.
- `schema/`: the JSON shapes `public/data/` must follow.
- `dataset/`: the dataset's licence, sources and release notes.
- `build/` and `build.mjs`: the build. Its output is not committed (`.gitignore` lists it).
- `worker/`: the sign-in and sync worker, built into `_worker.js`.
- `migrations/`: the sign-in database's tables.
- `room-server/`: the shared-table server (Cloudflare Workers).
- `table-server/`: the campaigns table server (Cloudflare Workers).
- `program/`: the Mac and Windows program, its server config and its tests.
- `swrpg_index/`, `swrpg_index.py`, `swrpg_mcp.py`, `pdf_ref.py`: the rules search engine over your own PDFs.
- `scripts/`: `run_tests.cjs` (`npm test`), the program's table-server kit (`scripts/argo_a4/`) and a few helpers.
- `test/`: the guards.
- `art/`: item art and textures this copy may share. Their credits are in `CREDITS.md`, at the repository's root.
- `guide/` and `GUIDE.md`: the program's first-start guide.
- `drawings/`: screens that were drawn and approved but not built.
- `decisions/`: architecture decision records.
- `Docs/`: design notes on how the code fits together.
- `.github/workflows/`: the dataset release.
- `serve.py`: the local server.
- `_headers`, `_redirects`, `_routes.json`: the site's rules for Cloudflare Pages (cache headers, redirects, and
  which paths go to the sign-in worker).
- `.env.example`: one optional key, `ANTHROPIC_API_KEY`, used only by the search engine's optional evaluation in
  `swrpg_index/eval/`. Copy it to `.env` (gitignored) only if you run that.

## 7. What is unfinished

True at 1.1.10:

- **The downloads are unsigned.** Mac and Windows warn on the first start; `GUIDE.md` shows the steps past it.
- **The downloads on the release page are 1.1.9 builds.** The source here is 1.1.10.
- **The program cannot be built from this copy.** `program/build.mjs` needs an export script that is not here
  (section 5).
- **The rules search engine needs more than `requirements.txt`.** The command line (`swrpg_index.py`) needs
  PyMuPDF even to list or search; without it, it stops with `ModuleNotFoundError: No module named 'fitz'`. The list of books an index is built from, `Docs/pdf_sources.json`, is not in this
  copy, so you write your own.
- **Rule text is blank and some art is missing.** See "What's different from holocron.work" in `README.md`.
- **Sign-in and tables need your own settings.** `lib/shared/siteSettings.js` is blank, so sign-in, shared tables
  and campaigns are off until you deploy your own servers (sections 5 and 8).
- **`drawings/` lists screens that were approved but not built.**
- **No guard is red** at 1.1.10.

## 8. Accounts and secrets

Names only. Never put a value in the repository.

**Accounts:** a Cloudflare account, for Pages (the site and its sign-in worker), D1 (the sign-in database) and
Workers (the room and table servers). A GitHub account, if you want the dataset release to run on your copy.
For sign-in, an app registered with each provider you want: Google, Discord or Microsoft.

**The sign-in worker** (`worker/`) reads:

- `BETTER_AUTH_URL`: the origin your site is served from (a plain variable, in `wrangler.toml`).
- `BETTER_AUTH_SECRET`: a secret. The worker refuses to start sign-in without it.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`,
  `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`: secrets. A provider's button shows only when both of its names
  are set.
- `DB`: the D1 database binding (`wrangler.toml`).
- `ASSETS`: the site's files. Cloudflare Pages supplies it; you set nothing.
- `SYNC_BUDGET_ROWS_WRITTEN_PER_DAY`, `SYNC_BUDGET_STORAGE_BYTES`, `SYNC_STOP_AT`: optional variables. They set where
  saving to the cloud stops to stay inside the free limits; unset, the worker uses its own defaults.
- `ALLOW_BREAK_GLASS`: test only. Never set it on a live site.

**The servers** read only their Durable Object bindings, set in their `wrangler.jsonc`: `ROOM` (room server);
`TABLE`, `LISTING` and `CODE` (table server). The table server also reads an optional `PRESENCE` binding, which only
the program's own config binds (`program/serve/holocron.capnp`); online, leave it unbound. `TEST_EMPTY_MS` is for
tests only.

**`.env`** (from `.env.example`): `ANTHROPIC_API_KEY`, only for the search engine's optional evaluation in
`swrpg_index/eval/`. Nothing else reads it. That evaluation (`swrpg_index/eval/agent.py`) also imports
`anthropic`, which `requirements.txt` does not install (`python-dotenv` comes in with `mcp`).

**`lib/shared/siteSettings.js`** holds the site's own values, all blank here: `ANALYTICS_TOKEN`,
`PRODUCTION_HOSTS`, `ROOM_SERVER_HOST`, `TABLE_SERVER_HOST`, `AUTH_ORIGIN`, `KOFI_URL`, and `BOOK_CONTENT`
(`'removed'`). The file says what each one turns on. Fill it in only in your own deployment's copy; keep it blank in
any pull request to this repository.

## 9. Rules for an agent working here

- **The rulebooks decide how the game behaves.** When code and a rule disagree, the book wins. Cite the book by its
  title and its printed page number. Never paste the book's words.
- **No book text, page images, or art you don't have the rights to**, anywhere in the tree: not in data, code,
  comments or docs.
- **Build and run the guards before any change, and again after it:** `npm run build && npm test`. A guard that was
  passing must still pass.
- **No secret in the tree.** No key, token, password or account id, in any file.
- **`lib/shared/siteSettings.js` stays blank.**
- **One change per pull request.** `CONTRIBUTING.md` has the rest; read it before you open one.

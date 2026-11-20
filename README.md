# Project Holocron

Free tools for playing the Star Wars roleplaying games (Edge of the Empire, Age of Rebellion, Force and Destiny):
a character creator and sheet, a GM board, a dice roller, and a search engine over your own rulebooks. This is the
open-source copy of the app that runs at holocron.work.

To set up a computer, run, test or release this code, read `START_HERE.md`.

**This is an unofficial fan project.** Star Wars belongs to Lucasfilm Ltd. The game and its rules belong to Fantasy
Flight Games and Edge Studio. Neither made, approved or endorsed this project. No Star Wars name, art or rulebook text
is offered under this repository's licences.

## What's different from holocron.work

- **No rulebook text.** The data keeps the game's numbers, trees, costs and the engine's own encoding, but the books'
  words are removed, so some rule text in the app is blank.
- **No art, fonts, sounds or map coordinates** that we can't share. The app runs without them and shows its
  built-in fallbacks. `BRING_YOUR_OWN_ART.md` says where your own files go.
- **No accounts or tables by default.** `lib/shared/siteSettings.js` holds the site's account values, and they're
  blank here: analytics is off, there is no tip link, signing in needs your own worker settings, and joining a table
  needs your own room server.

## Run it

You need Node.js 22 or later.

```sh
npm ci
npm run build
python3 serve.py          # http://localhost:3000 (or: python3 serve.py 8080)
```

The apps are at `/player/`, `/gm/` and `/dice/`.

## Tests

```sh
npm run build
npm test                  # runs each guard in test/ one file at a time
```

## The rules search engine

`swrpg_index/` builds a searchable index over rulebook PDFs **you own**, and serves it to the app and to an MCP
client. Python setup is in `requirements.txt`. Building an index needs PyMuPDF, which is licensed AGPL-3.0. It is not
part of this project and is not installed for you. Install it yourself only if you accept its licence.

## Deploying your own copy

`wrangler.example.toml` is a template for Cloudflare Pages with the sign-in worker. `room-server/` is the table
server. `table-server/` is the online-table server, deployed on its own like `room-server/`. Fill in
`lib/shared/siteSettings.js` with your own values.

## Licences

- **Code:** MIT (`LICENSE`) (covers the code only).
- **Dataset:** the project's own data and writing in `public/data/` and `schema/` are CC BY 4.0
  (`dataset/LICENSE`). Third-party sources keep their own terms and are credited in `dataset/SOURCES.md`.
  To credit the dataset: "Project Holocron by Aroo'Meh, https://github.com/Argo-Station/holocron, CC BY 4.0."
  Third-party sources are credited as `dataset/SOURCES.md` lists them.
- **Media:** `CREDITS.md`.

## Docs and decisions

`decisions/` holds the architecture decision records and `Docs/` the design notes. Names of rulings, gates,
briefs and DECISIONS entries in them refer to the workshop's private records and aren't included here.

See `CONTRIBUTING.md` to help, and `CODE_OF_CONDUCT.md` for how we work together.

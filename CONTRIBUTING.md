# Contributing

Thanks for helping. A few things keep this project healthy.

- **No rulebook text, and no art you don't have the rights to.** Don't paste the books' words into data, code
  comments or docs. Cite the book and page and say it in your own words. The export that builds this repository
  refuses ten or more words copied from a book.
- **Run the build and the tests** before a pull request: `npm ci && npm run build && npm test`.
- **Data changes** go in `public/data/` and must still validate against `schema/`.
- **Keep the live behaviour working.** `lib/shared/siteSettings.js` is blank in this copy. Don't hard-code a
  site's own values anywhere else.
- **One change per pull request**, with a plain description of what it changes for a player or a GM.

By contributing you agree your code is licensed MIT and your data and writing CC BY 4.0, as in `README.md`.
Be kind: see `CODE_OF_CONDUCT.md`.

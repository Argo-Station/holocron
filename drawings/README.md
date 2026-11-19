# Drawings not built yet

These screens were drawn and approved for Holocron but not built. If you want to pick one up and finish it, this page
says what each one is, what already exists, and where its code would go.

The drawings themselves aren't in this repository yet. They're saved as pictures of the app, and this repository's
content check doesn't accept pictures inside a page. What follows is each one in words.

## Ship Yard: whose ship it is, inside a campaign

- **What it is:** in the Ship Yard, an OWNER chip on a ship opens a picker that lists the player's characters and the
  campaigns they're in. GIVE TO… asks "Whose ship?" and can give the ship to a campaign's group. After that, the
  ship shows its new owner, and the GM's campaign page shows it under PARTY as the group's ship.
- **What's built:** the Ship Yard and the campaign pages. The owner picker and giving a ship to a group are not.
- **Where the code would go:** `lib/shared/yardView.jsx` (the Yard), `lib/shared/campaignsView.jsx` and
  `lib/shared/campaignStore.js` (the campaign page and its record).

## Between Sessions: the campaign between games

- **What it is:**
  - a strip on the player's home page saying what's waiting (XP sent, shared lines, the wish list);
  - a player's campaign page and the GM's campaign page, each grown with the group's Duty, Obligation, bases, starting
    resource and ship, and the GM's acts on them (rank up, add a base, pick the starting resource);
  - a lobby that players wait in before a table opens;
  - lore pages for planets and factions, in one shared module.
- **What's built:** the data under it (the group's record and summary, the shared wish list and its sync). The screens
  are not.
- **Where the code would go:** `lib/shared/campaignsView.jsx` for the pages and the lobby, `lib/shared/groupSummary.js`
  and `lib/shared/campaignStore.js` for the group, `lib/shared/holdsStore.js` for the wish list,
  `lib/shared/lore.js` for the lore pages.

## The program: installers, account link, update line

- **What it is:** for the program in `program/`, a Mac `.pkg` and a Windows `.msi` installer; a **Link to your
  account** button in the Holocron window, with a code to type at holocron.work, so a computer's characters and
  campaigns sync with your account; and a line in the window when a new version is out, with a **Get it** button.
- **What's built:** the Holocron window and the program on both computers, downloaded as zips. The installers, the
  link and the update line are not.
- **Where the code would go:** `program/mac/` and `program/windows/` (the installers, and the window's button: each
  window's source keeps a place for it), `account/` (the link page), and the update check in
  `program/mac/Sources/Update.swift` and `program/windows/Sources/Update.cs`, which runs only once a download address
  is set in `program/mac/Sources/Constants.swift` and `program/windows/Sources/Paths.cs`.

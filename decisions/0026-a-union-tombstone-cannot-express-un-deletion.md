# 0026. A union tombstone cannot express un-deletion, so restore is a separate feature

- **Date:** 2026-08-07
- **Status:** accepted

## Context

F-34's sync merges two devices by unioning records per key and matching on id. Deletions are carried
in one key, `swrpg_deleted_ids`, and the merge **unions the two tombstone lists and applies them
AFTER the record union**. That ordering is deliberate and load-bearing: without it, a device that
still holds a character you deleted elsewhere would resurrect it on the next sign-in. Deletion is
the most deliberate thing a person does to their own data, and it has to survive adoption.

When the conflict prompt was built, `resolve()` offered a natural-looking answer for a record the
person had deleted on this device while the account still held a copy: choosing "your account"
put the record back. The gate reporting that work described it as a supported answer.

It was true for exactly one render. The tombstone list only grows, so the next merge — the next
sign-in, the next re-check — unioned the still-present tombstone and deleted the restored record
again, silently. An answer given out loud, undone without a word.

The tempting fix is to remove the id from the tombstone list when a restore is chosen. That would
work for the one device in front of you and quietly weaken every deletion the feature makes,
because a tombstone that can be removed is a tombstone that can be lost in a merge.

## Decision

**A union-only tombstone is treated as the constraint it is: un-deletion is not expressible, and the
product does not pretend otherwise.**

Concretely, in the sync seam:

- a tombstoned id **closes its open question** — the deletion IS that person's answer, and it is
  pruned at the read points so a deletion made in another tab or by any code path closes it too;
- `resolve()` **refuses** a tombstoned restore with an honest `record_deleted` rather than performing
  one the next merge will undo;
- restore-shaped fixtures must run **the merge that FOLLOWS the answer**. Testing one render is what
  let the false claim pass review.

Real un-delete stays possible and is priced as its own feature: it needs tombstone stamps (so a
deletion can be ordered against a restore), a fresh-id restore (so the tombstone never applies), or
a read path over the history table that already retains every replaced value. That is F-66's orbit,
judged on its own merit when someone actually wants it.

## Alternatives considered

**Remove the id from the tombstone list on restore.** Makes the demo work and weakens the guarantee
that motivated tombstones in the first place. A deletion that can be undone by a merge is not a
deletion; C-B-1 exists precisely because resurrection is the failure users notice and never forgive.

**Last-writer-wins on the tombstone list instead of union.** Would let a restore beat a deletion by
being newer — and would also let one device's stale list discard another device's deletions
wholesale. Strictly worse: it trades a narrow missing capability for a broad data-loss path.

**Leave the restore in and accept that it sometimes doesn't stick.** Rejected on the feature's own
premise. The whole point of the prompt is that the system stops guessing and asks; an answer the
system then ignores is worse than never having asked.

## Consequences

- **Accepted:** you cannot bring back a character you deleted by answering a sync question. The
  refusal is honest and the question closes rather than lingering.
- **Preserved:** deletions survive adoption unconditionally, which is the property that made the
  tombstone a union in the first place.
- **For a future session:** if "restore a deleted character" is ever wanted, it is a feature with its
  own design — not a branch inside `resolve()`. The history table already keeps every replaced value
  ten deep per key, so the data exists; what is missing is a read path and a decision about identity
  (same id versus fresh id), and the answer to that is what makes it safe.
- **The testing lesson generalises beyond tombstones:** any assert about a merge-adjacent write must
  run the merge that follows it. A state that is correct at the moment of writing and wrong one
  reconciliation later will pass every single-step test ever written for it.

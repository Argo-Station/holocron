# Creator-built NATIVE saves — C-OEH-2 fixtures

Two characters **this project's own creator produced**, captured from the roster the moment the
wizard finished, and committed verbatim.

They exist because every other export fixture is a shipped PREGEN, and a pregen is not the shape the
creator actually emits. Diffing the two: a native save carries no `derived` and no `xp` block, while
`specializations` arrives as `[{id, owned: []}]`. An exporter proven only against pregens is proven
against a shape no player will ever have.

| file | what it is |
|---|---|
| `creator_human_smuggler.json` | the minimal career-only Human — EotE, Human/Smuggler/Pilot, nothing bought |
| `creator_human_guardian_fad.json` | a Force character — FaD, Human/Guardian, `morality: null` |

**These are OURS and they are NOT attestation.** They never go near `data-sources/ogg-saves/`, whose
whole rule is that it holds only what OggDude itself wrote (C-OGG2B-6). These are test INPUT — the
character we hand the exporter — not evidence about what the format is.

**The Morality ≠ 50 half of C-OEH-2 is not carried by these files, and the reason is worth writing
down: the creator does not set Morality at creation.** A brand-new Force character has
`morality: null`, so a native save carrying a non-50 Morality can only be produced by editing the
sheet afterwards. That half is instead falsified permanently by `test/ogg_export_morality.cjs`,
which drives a character at Morality 77 through both engines — evidence a one-time export could not
give, since a file proves what it contained once and a guard proves it every run.

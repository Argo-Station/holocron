# test/fixtures/argo_a5_import — G5's round-trip fixture

An OggDude-format data folder for `test/argo_a5_import.cjs` (ruling `argo-dataset-import-draft` ADDENDUM 4 §A4.1 G5).
**Every string is invented on a real key.** Nothing here is book text, and nothing may become book text: the keys are
our records' own (`_source_key`, `ogg_key`, `ogg_keys`, a quality's id), the names are game terms, the descriptions are
made up for the test. The test reads our records from `public/data/canonical`, blanks their rule text in memory as the
open copy does, imports this folder, and checks exactly which fields fill and which reasons the rest get.

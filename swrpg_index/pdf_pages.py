#!/usr/bin/env python3
"""pdf_pages.py — THE ONLY LEGAL PATH between a book's PRINTED page and its CORPUS page.

LIVES IN `swrpg_index/`, NOT `scripts/`, AND THAT PLACEMENT IS FORCED. It landed in `scripts/`
(B-335 A1-1) when its only callers were scripts. A1-4 makes the INDEX SERVICE a caller, and
`scripts/` has no `__init__.py` — it is not an importable package, and `swrpg_index` imports from
it nowhere. The dependency runs scripts/ -> swrpg_index and must not invert. The alternative was
the service converting from `utils.load_config()` itself, which is the second-resolution-path
defect this module exists to prevent. So it moved to the package both sides can import.

Ruled by `b335-calibration-recon` Addendum 1 (A1-1), at Jason's direction:

    "pdf page number problem keeps getting brought up and fixed, then gets forgotten.
     Can we have a permanent fix that future agents won't lose."

THE FACT THIS MODULE EXISTS TO HOLD
A book's PRINTED page number and its page number in our PDF/corpus are NOT the same number.
Front matter shifts them: printed p.95 of the Edge of the Empire core rulebook is corpus p.104
(offset 9); every other book's shift is its own `page_offset` in Docs/pdf_sources.json, never a
number written in prose (an offset named here once went stale when R-BOC-A6 re-earned it).
Every tool that reads the corpus — `read_pages`, the oracle, any cite check — addresses CORPUS
pages. Every citation a human can verify names a PRINTED page. Getting this wrong does not throw; it silently returns the
wrong page's text, which reads exactly like a correct answer.

WHY A MODULE AND NOT A NOTE. This has been rediscovered and re-fixed repeatedly (R-CVM-1,
ledger #105, R-EQW1's eote skew, B-334's forty TOC-blind books, B-335) and forgotten each time,
because the knowledge kept landing in a point-in-time artifact. A fact lost repeatedly needs a
STRUCTURE that holds it. So: **hand-rolled `page ± offset` arithmetic anywhere else in this repo
is the second-resolution-path defect by name** (CLAUDE.md §5 applied to page math), and
`scripts/check_page_arithmetic.py` reports offenders.

IT REFUSES RATHER THAN GUESSES. Most books are NOT calibrated — 29 of 100 carried an offset at
B-335 (33 at `commercial` @ f6d5bca8; `python -m swrpg_index.pdf_pages` prints the live count),
and B-335 deliberately left 7 blank because their evidence could not tell one offset from its
neighbour (R-BCR-3: a wrong offset makes every citation in that book confidently wrong, which is
worse than an honest blank). For an uncalibrated book every conversion returns `None` with a
reason, never a number. Callers must handle that; that is the point.

    from swrpg_index.pdf_pages import to_corpus, to_printed, status, PageMap

    to_corpus("eote", 95)      -> 104
    to_printed("eote", 104)    -> 95
    to_corpus("spy", 32)       -> None          (uncalibrated — no offset was earned)
    status("spy")              -> "uncalibrated"
    status("nonesuch")         -> "unknown-book"

Offsets live in `Docs/pdf_sources.json` (`page_offset`), measured and checked by
`scripts/b335_calibrate_offsets.py`. This module never computes one; it only spends them.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REGISTRY = os.path.join(ROOT, "Docs/pdf_sources.json")  # same file swrpg_index.utils.CONFIG_PATH names

# The honesty classes a caller may see. Named so a report can group by them rather than by
# a bare None, which cannot say WHICH kind of nothing it is (B-334's classes, same discipline).
CALIBRATED = "calibrated"
UNCALIBRATED = "uncalibrated"      # book is in the registry; no offset has been earned
UNKNOWN_BOOK = "unknown-book"      # alias is not in the registry at all


class PageMap(object):
    """Loaded once, queried many times. Module-level helpers below use a shared instance."""

    def __init__(self, path=REGISTRY):
        with open(path, encoding="utf-8") as fh:
            reg = json.load(fh)
        self._off = {}
        for s in reg.get("sources", []):
            a = s.get("alias")
            if a:
                self._off[a] = s.get("page_offset")

    def status(self, alias):
        if alias not in self._off:
            return UNKNOWN_BOOK
        return CALIBRATED if self._off[alias] is not None else UNCALIBRATED

    def offset(self, alias):
        return self._off.get(alias)

    def to_corpus(self, alias, printed_page):
        """PRINTED -> CORPUS. None when the book has no earned offset."""
        if self.status(alias) != CALIBRATED or printed_page is None:
            return None
        return int(printed_page) + self._off[alias]

    def to_printed(self, alias, corpus_page):
        """CORPUS -> PRINTED. None when the book has no earned offset."""
        if self.status(alias) != CALIBRATED or corpus_page is None:
            return None
        return int(corpus_page) - self._off[alias]

    def explain(self, alias):
        """One line a report or a human can read, instead of an unexplained None."""
        st = self.status(alias)
        if st == CALIBRATED:
            return "%s: calibrated, offset %+d (corpus = printed %+d)" % (
                alias, self._off[alias], self._off[alias])
        if st == UNCALIBRATED:
            return ("%s: UNCALIBRATED — no offset earned; a printed-page claim about this book "
                    "cannot be resolved to a corpus page (B-335 left it blank rather than "
                    "guess)" % alias)
        return "%s: UNKNOWN BOOK — not in Docs/pdf_sources.json" % alias


_shared = None
_shared_path = REGISTRY
_shared_sig = None


def _sig(path):
    st = os.stat(path)
    return (st.st_mtime_ns, st.st_size)


def _rel(path):
    return os.path.relpath(path, ROOT) if path.startswith(ROOT) else path


def _map():
    """The shared map, built once per process. Batch runs (ingest, the audit, the calibrator) read it this way and
    only this way, so one run never mixes two registries."""
    global _shared, _shared_sig
    if _shared is None:
        _shared_sig = _sig(_shared_path)
        _shared = PageMap(_shared_path)
    return _shared


def refresh_if_changed(path=None):
    """A LONG-LIVED PROCESS SEES AN OFFSET CHANGE WITHOUT A RESTART (`oracle-o6-page-tools` R-OPT-4, B-1116). The rules
    service builds the shared map once and serves for days; after D-66 wrote smuggler 1, it went on stamping
    `printed_offset` 2 until it was restarted by hand. It calls this at the start of every tool call: when the
    registry's (mtime, size) differs from the one the shared map was built from, the map is rebuilt and the change is
    logged (stderr — the service's stdout carries MCP frames). `path` is the registry to watch (default
    Docs/pdf_sources.json); a test injects a copy here, never by editing the real one. Returns True when it rebuilt.

    A REGISTRY CAUGHT MID-WRITE IS NOT A CRASH (ruling `oracle-o7` C-O7H-3, B-1137 b). A hand edit or a checkout can
    leave the file missing or half-written for a moment; when the stat or the parse fails while a map already exists,
    the OLD map and the OLD signature stay, one stderr line names the failure, and it returns False, so the next call
    retries. With no map yet it raises as before: a process never serves an empty map silently."""
    global _shared, _shared_path, _shared_sig
    path = path or _shared_path
    try:
        sig = _sig(path)
        if _shared is not None and path == _shared_path and sig == _shared_sig:
            return False
        fresh = PageMap(path)
    except (OSError, ValueError) as e:
        if _shared is None:
            raise
        sys.stderr.write("[pdf_pages] %s unreadable (%s: %s) — kept the page map built from %s; retried on the next "
                         "call\n" % (_rel(path), type(e).__name__, e, _rel(_shared_path)))
        return False
    old = _shared
    _shared, _shared_path, _shared_sig = fresh, path, sig
    if old is not None:
        moved = sorted(a for a in set(old._off) | set(_shared._off) if old._off.get(a) != _shared._off.get(a))
        sys.stderr.write("[pdf_pages] %s changed — page map rebuilt; offsets moved: %s\n"
                         % (_rel(path),
                            ", ".join("%s %s -> %s" % (a, old._off.get(a), _shared._off.get(a)) for a in moved)
                            or "none"))
    return True


def to_corpus(alias, printed_page):
    return _map().to_corpus(alias, printed_page)


def to_printed(alias, corpus_page):
    return _map().to_printed(alias, corpus_page)


def status(alias):
    return _map().status(alias)


def offset(alias):
    return _map().offset(alias)


def explain(alias):
    return _map().explain(alias)


if __name__ == "__main__":
    m = _map()
    cal = [a for a in m._off if m.status(a) == CALIBRATED]
    unc = [a for a in m._off if m.status(a) == UNCALIBRATED]
    print("pdf_pages — printed<->corpus conversion (the only legal path, A1-1)")
    print("  calibrated  : %d" % len(cal))
    print("  uncalibrated: %d  (conversion REFUSES for these)" % len(unc))
    print("")
    for a in ("eote", "aor", "fad"):
        print("  " + m.explain(a))
    if unc:
        print("  " + m.explain(sorted(unc)[0]))

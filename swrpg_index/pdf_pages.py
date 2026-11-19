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
# THE RUN FORM (C-C1P-4, ruling `corpus-c2-slice-card`). A book whose printed numbering is not one offset carries
# `page_runs: [{"from", "to", "printed_from", "step"}]` (corpus pages inclusive; step 2 = a two-up spread holding
# printed p and p+1) instead of `page_offset` — never both. Its status is MAPPED, NOT CALIBRATED, on purpose: callers
# that gate on CALIBRATED and then spend `offset()` keep refusing a mapped book rather than reading its None offset as
# 0. Only `to_corpus`/`to_printed` convert it. Per page, two more honesty classes:
MAPPED = "mapped"                  # book is in the registry with page runs (read by the folio reader)
REFUSED = "refused"                # a printed page two runs both produce: never resolved by a guess
NO_PRINTED = "no-printed-number"   # a mapped book's corpus page outside every run, or a printed page no run makes
# THE PART AXIS (C-C2F-4, ruling `corpus-c2-card`). A book bound from booklets that each number their own pages (today
# eote-beginner alone) labels each run with an optional `part`, the booklet's own cover title. Within one part a printed
# page two runs produce is REFUSED, as for any run book. Across parts, `to_corpus(alias, printed)` with no part is
# REFUSED when two parts produce the page, and answers with `part` given; `to_printed` answers a `Printed`, the number
# with its `.part` beside it. Offset books and part-less runs answer byte-for-byte as before (plain ints).
# THE PART BOUNDS (C-C2FG-1, ruling `corpus-c2-full` D-C2F1 (b)). A book whose runs carry `part` also carries
# `page_parts: [{"part", "from", "to"}]`, each booklet's corpus bounds; they never overlap, and every run of a part lies
# inside its bounds. A part's POSSIBLE printed pages are the numbers its runs' numbering gives carried over the part's
# whole bounds (pages its booklet may print though no read proved them). With no part named, a printed page answers
# only when exactly one part's possible set holds it; else it is REFUSED (a bare "p.17" never lands in a guessed
# booklet). With the part named, `to_printed`, and every part-less book: unchanged.


class Printed(int):
    """A printed page number from a parted book: an int (so a caller that compares numbers is unchanged) carrying the
    booklet it is printed in as `.part`."""

    def __new__(cls, n, part):
        o = int.__new__(cls, n)
        o.part = part
        return o

    def __repr__(self):
        return "%d (%s)" % (int(self), self.part)


class PageMap(object):
    """Loaded once, queried many times. Module-level helpers below use a shared instance."""

    def __init__(self, path=REGISTRY):
        with open(path, encoding="utf-8") as fh:
            reg = json.load(fh)
        self._off = {}
        self._runs = {}
        self._parts = {}
        for s in reg.get("sources", []):
            a = s.get("alias")
            if a:
                self._off[a] = s.get("page_offset")
                if s.get("page_runs") is not None:
                    if s.get("page_offset") is not None:
                        raise ValueError("%s carries page_offset AND page_runs (C-C1P-4: one or the other)" % a)
                    self._runs[a] = [_run(a, r) for r in s["page_runs"]]
                    if any("part" in r for r in self._runs[a]) or s.get("page_parts") is not None:
                        self._parts[a] = _parts(a, s.get("page_parts"), self._runs[a])

    def status(self, alias):
        if alias not in self._off:
            return UNKNOWN_BOOK
        if alias in getattr(self, "_runs", {}):
            return MAPPED
        return CALIBRATED if self._off[alias] is not None else UNCALIBRATED

    def offset(self, alias):
        return self._off.get(alias)

    def runs(self, alias):
        """A mapped book's runs (copies), else None."""
        rs = getattr(self, "_runs", {}).get(alias)
        return [dict(r) for r in rs] if rs is not None else None

    def parts(self, alias):
        """A mapped book's part labels in run order (C-C2F-4), else []: [] for a part-less or offset book."""
        out = []
        for r in getattr(self, "_runs", {}).get(alias) or []:
            if r.get("part") is not None and r["part"] not in out:
                out.append(r["part"])
        return out

    def bounds(self, alias):
        """A parted book's page_parts (copies), else None (C-C2FG-1)."""
        ps = getattr(self, "_parts", {}).get(alias)
        return [dict(x) for x in ps] if ps is not None else None

    def _possible_parts(self, alias, printed):
        """The parts whose POSSIBLE set holds `printed`: some run of the part, its numbering carried over the part's
        whole bounds, prints it (C-C2FG-1)."""
        out = []
        for b in self._parts[alias]:
            for r in self._runs[alias]:
                if r.get("part") != b["part"]:
                    continue
                lo = r["printed_from"] + r["step"] * (b["from"] - r["from"])
                hi = r["printed_from"] + r["step"] * (b["to"] - r["from"]) + (r["step"] - 1)
                if lo <= printed <= hi:
                    out.append(b["part"])
                    break
        return out

    def _bare_part(self, alias, printed, part):
        """(part, refused): with no part named on a parted book, the one part that could print `printed`, or
        refused=True when two could (C-C2FG-1). Otherwise the part as given."""
        if part is not None or alias not in getattr(self, "_parts", {}):
            return part, False
        could = self._possible_parts(alias, printed)
        return (could[0], False) if len(could) == 1 else (None, len(could) > 1)

    def _producers(self, alias, printed, part=None):
        return [r for r in self._runs[alias]
                if r["printed_from"] <= printed <= r["printed_from"] + r["step"] * (r["to"] - r["from"])
                + (r["step"] - 1) and (part is None or r.get("part") == part)]

    def page_class(self, alias, printed_page, part=None):
        """Why `to_corpus` answered what it did, per page: CALIBRATED/MAPPED when it converts, else UNCALIBRATED,
        UNKNOWN_BOOK, REFUSED (two runs produce it: in one part, or in two parts and no `part` was named) or
        NO_PRINTED (no run makes it, in the named part when one is)."""
        st = self.status(alias)
        if st != MAPPED or printed_page is None:
            return st
        part, refused = self._bare_part(alias, int(printed_page), part)
        if refused:
            return REFUSED
        n = len(self._producers(alias, int(printed_page), part))
        return MAPPED if n == 1 else (REFUSED if n > 1 else NO_PRINTED)

    def to_corpus(self, alias, printed_page, part=None):
        """PRINTED -> CORPUS. None when the book has no earned offset or runs, and for a mapped book when no run, or
        more than one run, produces the printed page (`page_class` says which). `part` names the booklet of a parted
        book (C-C2F-4); with it only that part's runs answer, without it a page two parts COULD print (C-C2FG-1: their
        possible sets) is REFUSED. A part on an offset book, or on a book whose runs carry no such part, answers
        None."""
        st = self.status(alias)
        if printed_page is None or st not in (CALIBRATED, MAPPED):
            return None
        if st == CALIBRATED:
            if part is not None:
                return None
            return int(printed_page) + self._off[alias]
        part, refused = self._bare_part(alias, int(printed_page), part)
        if refused:
            return None
        hit = self._producers(alias, int(printed_page), part)
        if len(hit) != 1:
            return None
        r = hit[0]
        return r["from"] + (int(printed_page) - r["printed_from"]) // r["step"]

    def to_printed(self, alias, corpus_page):
        """CORPUS -> PRINTED. None when the book has no earned offset or runs, and for a mapped book's page outside
        every run. A step-2 spread page answers its LOWER folio (it holds that and the next)."""
        st = self.status(alias)
        if corpus_page is None or st not in (CALIBRATED, MAPPED):
            return None
        if st == CALIBRATED:
            return int(corpus_page) - self._off[alias]
        c = int(corpus_page)
        for r in self._runs[alias]:
            if r["from"] <= c <= r["to"]:
                n = r["printed_from"] + r["step"] * (c - r["from"])
                return n if r.get("part") is None else Printed(n, r["part"])
        return None

    def shift(self, alias, printed_page, part=None):
        """corpus - printed AT this printed page, through the converter (B-1850): an offset book's offset, a mapped
        book's run-local shift, None where `to_corpus` refuses. A caller that needs "how far apart the two numberings
        are here" reads it from this, never by subtracting itself."""
        c = self.to_corpus(alias, printed_page, part)
        return None if c is None else c - int(printed_page)

    def explain(self, alias):
        """One line a report or a human can read, instead of an unexplained None."""
        st = self.status(alias)
        if st == CALIBRATED:
            return "%s: calibrated, offset %+d (corpus = printed %+d)" % (
                alias, self._off[alias], self._off[alias])
        if st == MAPPED:
            rs = self._runs[alias]
            return ("%s: mapped by %d page run(s) (%s); a corpus page outside every run has no printed number, and "
                    "a printed page two runs both produce is REFUSED" % (alias, len(rs), "; ".join(
                        "corpus %d-%d = printed %d%s%s" % (r["from"], r["to"], r["printed_from"],
                                                           "" if r["step"] == 1 else " (two-up)",
                                                           "" if r.get("part") is None else " in %s" % r["part"])
                        for r in rs)))
        if st == UNCALIBRATED:
            return ("%s: UNCALIBRATED — no offset earned; a printed-page claim about this book "
                    "cannot be resolved to a corpus page (B-335 left it blank rather than "
                    "guess)" % alias)
        return "%s: UNKNOWN BOOK — not in Docs/pdf_sources.json" % alias


def _run(alias, r):
    try:
        out = {k: int(r[k]) for k in ("from", "to", "printed_from", "step")}
    except (KeyError, TypeError, ValueError):
        raise ValueError("%s: a page run needs integer from/to/printed_from/step: %r" % (alias, r))
    if out["step"] not in (1, 2) or out["to"] < out["from"] or out["from"] < 1:
        raise ValueError("%s: a page run must have step 1 or 2 and 1 <= from <= to: %r" % (alias, r))
    if "part" in r:
        # C-C2F-4: a short non-empty label; a part-less run carries no key at all, so its dict is as it was
        if not isinstance(r["part"], str) or not r["part"].strip():
            raise ValueError("%s: a page run's part must be a non-empty label: %r" % (alias, r))
        out["part"] = r["part"]
    return out


def _parts(alias, parts, runs):
    """C-C2FG-1: page_parts loaded and validated — present on a parted book, integer bounds that never overlap, one
    entry per label, and every run of a part inside its part's bounds."""
    if not isinstance(parts, list) or not parts:
        raise ValueError("%s: runs carry a part, so the source carries page_parts (C-C2FG-1): %r" % (alias, parts))
    out = []
    for p in parts:
        try:
            b = {"part": p["part"], "from": int(p["from"]), "to": int(p["to"])}
        except (KeyError, TypeError, ValueError):
            raise ValueError("%s: a page part needs part/from/to: %r" % (alias, p))
        if not isinstance(b["part"], str) or not b["part"].strip() or not 1 <= b["from"] <= b["to"]:
            raise ValueError("%s: a page part needs a label and 1 <= from <= to: %r" % (alias, p))
        out.append(b)
    labels = [b["part"] for b in out]
    if len(set(labels)) != len(labels):
        raise ValueError("%s: page_parts names a part twice: %r" % (alias, labels))
    srt = sorted(out, key=lambda b: b["from"])
    for x, y in zip(srt, srt[1:]):
        if y["from"] <= x["to"]:
            raise ValueError("%s: page parts %r and %r overlap" % (alias, x["part"], y["part"]))
    by = {b["part"]: b for b in out}
    for r in runs:
        b = by.get(r.get("part"))
        if b is None or not (b["from"] <= r["from"] and r["to"] <= b["to"]):
            raise ValueError("%s: run %r lies outside its part's bounds %r" % (alias, r, b))
    return out


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
        moved = sorted(a for a in set(old._off) | set(_shared._off)
                       if (old._off.get(a), old._runs.get(a)) != (_shared._off.get(a), _shared._runs.get(a)))
        sys.stderr.write("[pdf_pages] %s changed — page map rebuilt; offsets moved: %s\n"
                         % (_rel(path),
                            ", ".join("%s %s -> %s" % (a, old._off.get(a), _shared._off.get(a)) for a in moved)
                            or "none"))
    return True


def to_corpus(alias, printed_page, part=None):
    return _map().to_corpus(alias, printed_page, part)


def to_printed(alias, corpus_page):
    return _map().to_printed(alias, corpus_page)


def status(alias):
    return _map().status(alias)


def offset(alias):
    return _map().offset(alias)


def explain(alias):
    return _map().explain(alias)


def runs(alias):
    return _map().runs(alias)


def page_class(alias, printed_page, part=None):
    return _map().page_class(alias, printed_page, part)


def parts(alias):
    return _map().parts(alias)


def bounds(alias):
    return _map().bounds(alias)


def shift(alias, printed_page, part=None):
    return _map().shift(alias, printed_page, part)


if __name__ == "__main__":
    m = _map()
    cal = [a for a in m._off if m.status(a) == CALIBRATED]
    unc = [a for a in m._off if m.status(a) == UNCALIBRATED]
    mapd = [a for a in m._off if m.status(a) == MAPPED]
    print("pdf_pages — printed<->corpus conversion (the only legal path, A1-1)")
    print("  calibrated  : %d" % len(cal))
    print("  mapped      : %d  (page runs, C-C1P-4)" % len(mapd))
    print("  uncalibrated: %d  (conversion REFUSES for these)" % len(unc))
    print("")
    for a in ("eote", "aor", "fad"):
        print("  " + m.explain(a))
    if unc:
        print("  " + m.explain(sorted(unc)[0]))

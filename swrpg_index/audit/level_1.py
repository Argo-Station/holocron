"""Phase 1 / Level 1 audit: per-PDF statistical inventory.

Reads from the indexed DB and produces:
- A JSON data artifact at Docs/audit_artifacts/level_1_data.json
- A markdown report at Docs/AUDIT_LEVEL_1.md (preserves the methodology
  / structural preamble; replaces the placeholder section bodies with
  findings).

Run:  python3 -m swrpg_index.audit.level_1
"""

from __future__ import annotations

import datetime
import json
import re
import sqlite3
import statistics
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

from ..utils import DB_PATH

ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_PATH = ROOT / "Docs" / "audit_artifacts" / "level_1_data.json"
REPORT_PATH = ROOT / "Docs" / "AUDIT_LEVEL_1.md"

# Confidence thresholds for suspicious chunks (per AUDIT.md conventions)
SHORT_CHUNK_CAP = 100   # chars below this = suspiciously short
LONG_CHUNK_CAP = 2000   # chars above this = suspiciously long

# Cross-alias overlap variant families (extends Threepio's dedup map by
# also testing the -gm variants to confirm their distinctness)
VARIANT_FAMILIES = {
    "fad": ["fad", "fad-ocr", "fad-lite", "fad-beginner", "fad-gm"],
    "eote": ["eote", "eote-beginner", "eote-gm"],
    "aor": ["aor", "aor-beginner", "aor-gm"],
}

# Per-PDF category assignment. Where automatic classification by alias
# pattern is unambiguous (folio-* → folios; *-beginner → beginner game,
# etc.) we use the pattern; otherwise an explicit map.
EXPLICIT_CATEGORY = {
    "eote": "Core rulebook",
    "aor": "Core rulebook",
    "fad": "Core rulebook",
    "fad-ocr": "Core rulebook (variant extraction)",
    "fad-lite": "Core rulebook (variant extraction)",
    "gadgets": "Supplement",
    "ships": "Supplement",
    "holocron": "GM resource",
    "atlas": "Supplement",
    "adversary-cards": "Reference",
    "talent-index": "Reference",
    # Career sourcebooks — EotE careers
    "bounty": "EotE career sourcebook",
    "colonist": "EotE career sourcebook",
    "explorer": "EotE career sourcebook",
    "hired": "EotE career sourcebook",
    "smuggler": "EotE career sourcebook",
    "tech": "EotE career sourcebook",
    # Career sourcebooks — AoR careers
    "commander": "AoR career sourcebook",
    "diplomat": "AoR career sourcebook",
    "engineer": "AoR career sourcebook",
    "pilot": "AoR career sourcebook",
    "soldier": "AoR career sourcebook",
    "spy": "AoR career sourcebook",
    # Career sourcebooks — FaD careers
    "guardian": "FaD career sourcebook",
    "consular": "FaD career sourcebook",
    "mystic": "FaD career sourcebook",
    "seeker": "FaD career sourcebook",
    "sentinel": "FaD career sourcebook",
    "warrior": "FaD career sourcebook",
    # Adventure modules
    "corellia": "Adventure / setting book",
    "hutt": "Adventure / setting book",
    "alliance": "Adventure / setting book",
    "forceworlds": "Adventure / setting book",
    "dawn": "Adventure / setting book",
    "collapse": "Adventure / setting book",
    "separatists": "Adventure / setting book",
    "old-republic": "Adventure / setting book",
}


def categorize(alias: str) -> str:
    if alias in EXPLICIT_CATEGORY:
        return EXPLICIT_CATEGORY[alias]
    if alias.endswith("-beginner"):
        return "Beginner Game box"
    if alias.endswith("-gm"):
        return "GM Kit"
    if alias.startswith("folio-"):
        return "Adventure folio"
    return "Uncategorized"


# ── Stats helpers ──────────────────────────────────────────────────────────

def dist_summary(values: list[int]) -> dict:
    """Return median / IQR / p10–p90 / mean / count for a value list."""
    if not values:
        return {"n": 0, "mean": None, "median": None, "p10": None,
                "p25": None, "p75": None, "p90": None,
                "min": None, "max": None}
    s = sorted(values)
    n = len(s)
    def pct(p):
        idx = max(0, min(n - 1, int(round((p / 100.0) * (n - 1)))))
        return s[idx]
    return {
        "n": n,
        "mean": round(statistics.fmean(s), 1),
        "median": pct(50),
        "p10": pct(10),
        "p25": pct(25),
        "p75": pct(75),
        "p90": pct(90),
        "min": s[0],
        "max": s[-1],
    }


def fmt_dist(d: dict, unit: str = "") -> str:
    """One-line distribution descriptor for markdown."""
    if not d or d.get("n", 0) == 0:
        return "n=0"
    suffix = f" {unit}" if unit else ""
    return (
        f"median={d['median']}{suffix} | "
        f"IQR={d['p25']}–{d['p75']}{suffix} | "
        f"p10–p90={d['p10']}–{d['p90']}{suffix} | "
        f"mean={d['mean']}{suffix} | "
        f"min/max={d['min']}/{d['max']}{suffix} (n={d['n']})"
    )


# ── DB loaders ─────────────────────────────────────────────────────────────

def load_pdfs(cur) -> dict[str, dict]:
    out = {}
    for row in cur.execute(
        "SELECT alias, name, path, tier, page_count, has_text, has_ocr, "
        "ingested_at FROM pdfs"
    ):
        alias, name, path, tier, page_count, has_text, has_ocr, ingested = row
        out[alias] = {
            "alias": alias,
            "name": name,
            "path": path,
            "tier": tier,
            "page_count": page_count or 0,
            "has_text": bool(has_text),
            "has_ocr": bool(has_ocr),
            "ingested_at": ingested,
            "category": categorize(alias),
        }
    return out


def load_chunks_by_alias(cur) -> dict[str, list[dict]]:
    """Group chunks by alias for per-PDF aggregation."""
    out = defaultdict(list)
    for row in cur.execute(
        "SELECT alias, page_start, page_end, chapter, section, content_type, "
        "char_count, text FROM chunks"
    ):
        alias, p_start, p_end, ch, sec, ctype, char_count, text = row
        out[alias].append({
            "page_start": p_start, "page_end": p_end,
            "chapter": ch, "section": sec, "content_type": ctype,
            "char_count": char_count, "text": text or "",
        })
    return out


def load_topic_mapping(cur) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Return (alias->topics, topic->aliases) mappings."""
    alias_topics = defaultdict(set)
    topic_aliases = defaultdict(set)
    for name, alias, fragment, priority in cur.execute(
        "SELECT name, alias, section_fragment, priority FROM topics"
    ):
        alias_topics[alias].add(name)
        topic_aliases[name].add(alias)
    return (
        {a: sorted(ts) for a, ts in alias_topics.items()},
        {t: sorted(als) for t, als in topic_aliases.items()},
    )


# ── Per-PDF profile ────────────────────────────────────────────────────────

OCR_PREFIX_RE = re.compile(r"^\[OCR\]", re.MULTILINE)


def per_pdf_profile(meta: dict, chunks: list[dict], alias_topics: list[str],
                    primary_topics_for_alias: list[str]) -> dict:
    char_counts = [c["char_count"] for c in chunks if c["char_count"] is not None]
    short_n = sum(1 for c in char_counts if c < SHORT_CHUNK_CAP)
    long_n = sum(1 for c in char_counts if c > LONG_CHUNK_CAP)
    ctype_counts = Counter(c["content_type"] for c in chunks)

    pages_covered = set()
    for c in chunks:
        ps, pe = c["page_start"], c["page_end"]
        if ps is None:
            continue
        if pe is None or pe < ps:
            pages_covered.add(ps)
        else:
            for p in range(ps, pe + 1):
                pages_covered.add(p)

    # Provenance from has_text/has_ocr/path
    if meta["has_text"] and meta["has_ocr"]:
        extraction = "hybrid (native text + OCR fallback)"
    elif meta["has_ocr"] and not meta["has_text"]:
        extraction = "OCR-only (image-based PDF)"
    elif meta["has_text"] and not meta["has_ocr"]:
        extraction = "native text only"
    else:
        extraction = "unknown"
    # Source attribution by category. Paths in the DB are pre-migration
    # Windows paths and don't carry source signal; categorize by alias /
    # name instead. This is "our framing" — see methodology notes.
    name_lower = meta["name"].lower()
    cat = meta["category"]
    if "homebrew" in name_lower:
        source = "homebrew / community"
    elif cat in {"Core rulebook", "Beginner Game box", "GM Kit",
                 "EotE career sourcebook", "AoR career sourcebook",
                 "FaD career sourcebook", "Adventure / setting book",
                 "Supplement", "GM resource", "Reference"}:
        source = "official FFG / Edge Studio (inferred from category)"
    elif "variant extraction" in cat:
        source = "derived from official (re-processed locally)"
    elif cat == "Adventure folio":
        source = "pre-gen folio (mix of official + community)"
    else:
        source = "unclassified"

    # OCR coverage at the PDF level: binary (has_ocr) is the best signal
    # the DB exposes; per-page OCR breakdown is not in the schema.
    ocr_coverage_note = (
        f"has_ocr=True (per-page breakdown not in schema)"
        if meta["has_ocr"] else "no OCR applied"
    )

    # Quality concerns — light heuristic scan of the chunk corpus
    concerns = []
    if pages_covered and meta["page_count"]:
        coverage_ratio = len(pages_covered) / meta["page_count"]
        if coverage_ratio < 0.5:
            concerns.append({
                "marker": "[POPULATION]",
                "issue": f"chunk coverage {len(pages_covered)}/{meta['page_count']} "
                         f"pages ({coverage_ratio:.0%}) — many pages produced no chunks",
            })
    if char_counts:
        short_frac = short_n / len(char_counts)
        long_frac = long_n / len(char_counts)
        if short_frac > 0.20:
            concerns.append({
                "marker": "[POPULATION]",
                "issue": f"high short-chunk rate ({short_n}/{len(char_counts)}, "
                         f"{short_frac:.0%}); may indicate OCR fragmentation",
            })
        if long_frac > 0.10:
            concerns.append({
                "marker": "[POPULATION]",
                "issue": f"high long-chunk rate ({long_n}/{len(char_counts)}, "
                         f"{long_frac:.0%}); may indicate failed chunk-boundary "
                         f"detection",
            })

    return {
        "meta": meta,
        "total_chunks": len(chunks),
        "pages_with_chunks": len(pages_covered),
        "chunk_density_per_page": (
            round(len(chunks) / meta["page_count"], 2)
            if meta["page_count"] else None
        ),
        "char_dist": dist_summary(char_counts),
        "short_chunks_n": short_n,
        "long_chunks_n": long_n,
        "content_type_counts": dict(ctype_counts),
        "topics_contributed_to": alias_topics,
        "topics_primary_source": primary_topics_for_alias,
        "extraction_method": extraction,
        "source_attribution": source,
        "ocr_coverage_note": ocr_coverage_note,
        "concerns": concerns,
    }


# ── Cross-alias overlap (Section 5) ────────────────────────────────────────

def page_concat_text(chunks: list[dict]) -> dict[int, str]:
    """For each page_start, concatenate all chunk text for fast similarity."""
    by_page = defaultdict(list)
    for c in chunks:
        ps = c["page_start"]
        if ps is None:
            continue
        by_page[ps].append(c["text"])
    return {p: " ".join(ts) for p, ts in by_page.items()}


def alias_overlap(a_chunks: list[dict], b_chunks: list[dict]) -> dict:
    """Return overlap stats between two aliases' chunk sets, page-by-page."""
    a_pages = page_concat_text(a_chunks)
    b_pages = page_concat_text(b_chunks)
    shared_pages = sorted(set(a_pages.keys()) & set(b_pages.keys()))
    if not shared_pages:
        return {
            "shared_pages": 0, "a_only": len(a_pages), "b_only": len(b_pages),
            "ratios": [], "mean_ratio": None, "near_duplicate_pages": 0,
        }
    ratios = []
    near_dup = 0
    for p in shared_pages:
        # SequenceMatcher with quick_ratio is fast on long strings; use
        # the standard ratio for accuracy on the typically <4KB pages.
        r = SequenceMatcher(None, a_pages[p], b_pages[p]).ratio()
        ratios.append(r)
        if r >= 0.85:
            near_dup += 1
    return {
        "shared_pages": len(shared_pages),
        "a_only": len(a_pages) - len(shared_pages),
        "b_only": len(b_pages) - len(shared_pages),
        "ratios": [round(r, 3) for r in ratios],
        "mean_ratio": round(statistics.fmean(ratios), 3) if ratios else None,
        "median_ratio": round(statistics.median(ratios), 3) if ratios else None,
        "near_duplicate_pages": near_dup,
    }


def compute_overlaps(chunks_by_alias: dict[str, list[dict]]) -> dict:
    """All pairwise overlaps within each variant family."""
    out = {}
    for fam_name, members in VARIANT_FAMILIES.items():
        present = [m for m in members if m in chunks_by_alias]
        pairs = []
        for i, a in enumerate(present):
            for b in present[i + 1:]:
                pairs.append({
                    "a": a, "b": b,
                    "overlap": alias_overlap(
                        chunks_by_alias[a], chunks_by_alias[b]
                    ),
                })
        out[fam_name] = {"members": present, "pairs": pairs}
    return out


# ── Topic / tier coverage (Section 4) ─────────────────────────────────────

def topic_coverage(topic_aliases: dict[str, list[str]],
                   pdfs: dict[str, dict]) -> dict:
    orphans = [t for t, als in topic_aliases.items() if not als]
    single_pdf = {t: als[0] for t, als in topic_aliases.items() if len(als) == 1}
    broad = {t: als for t, als in topic_aliases.items() if len(als) >= 5}
    # Tier coverage: count aliases per tier
    tier_count = Counter(p["tier"] for p in pdfs.values())
    return {
        "total_topics": len(topic_aliases),
        "orphan_topics": orphans,
        "single_pdf_topics": single_pdf,
        "broad_coverage_topics": broad,
        "tier_counts": dict(tier_count),
    }


def primary_topics_per_alias(topic_aliases: dict[str, list[str]]) -> dict[str, list[str]]:
    """A topic is 'primary' for an alias if that alias is the only contributor."""
    out = defaultdict(list)
    for t, als in topic_aliases.items():
        if len(als) == 1:
            out[als[0]].append(t)
    return {a: sorted(ts) for a, ts in out.items()}


# ── Section 3 cross-PDF aggregations ──────────────────────────────────────

def cross_pdf_summary(profiles: dict[str, dict]) -> dict:
    densities = [p["chunk_density_per_page"] for p in profiles.values()
                 if p["chunk_density_per_page"] is not None]
    medians = [p["char_dist"]["median"] for p in profiles.values()
               if p["char_dist"]["median"] is not None]
    coverages = []
    for p in profiles.values():
        pc = p["meta"]["page_count"]
        if pc:
            coverages.append(p["pages_with_chunks"] / pc)
    short_concentration = [
        (a, p["short_chunks_n"]) for a, p in profiles.items()
    ]
    short_concentration.sort(key=lambda x: -x[1])
    long_concentration = [
        (a, p["long_chunks_n"]) for a, p in profiles.items()
    ]
    long_concentration.sort(key=lambda x: -x[1])
    ctype_global = Counter()
    for p in profiles.values():
        ctype_global.update(p["content_type_counts"])
    extraction_methods = Counter(p["extraction_method"] for p in profiles.values())
    return {
        "chunk_density_dist": dist_summary([round(d, 2) for d in densities]),
        "median_chunksize_dist": dist_summary(medians),
        "page_coverage_dist": dist_summary([round(c, 3) for c in coverages]),
        "top10_short_concentration": short_concentration[:10],
        "top10_long_concentration": long_concentration[:10],
        "content_type_global": dict(ctype_global),
        "extraction_method_counts": dict(extraction_methods),
    }


# ── Markdown rendering ────────────────────────────────────────────────────

def render_inventory_section(pdfs: dict[str, dict]) -> str:
    by_cat = defaultdict(list)
    for p in pdfs.values():
        by_cat[p["category"]].append(p)
    out = ["## Section 1 — Corpus inventory",
           "",
           f"`[POPULATION]` 75 PDFs indexed across "
           f"{len(by_cat)} categories. Tier distribution: "
           f"{Counter(p['tier'] for p in pdfs.values()).most_common()}.",
           ""]
    for cat in sorted(by_cat.keys()):
        items = sorted(by_cat[cat], key=lambda p: p["alias"])
        out.append(f"### {cat} ({len(items)})")
        out.append("")
        out.append("| Alias | Title | Tier | Pages | has_text | has_ocr |")
        out.append("| --- | --- | --- | --- | --- | --- |")
        for p in items:
            out.append(
                f"| `{p['alias']}` | {p['name']} | {p['tier']} | "
                f"{p['page_count']} | {p['has_text']} | {p['has_ocr']} |"
            )
        out.append("")
    return "\n".join(out)


def render_pdf_profile(p: dict) -> str:
    meta = p["meta"]
    cd = p["char_dist"]
    out = [
        f"## `{meta['alias']}` — {meta['name']}",
        "",
        "### Provenance",
        f"- Source: {p['source_attribution']}",
        f"- Extraction method: {p['extraction_method']}",
        f"- OCR coverage: {p['ocr_coverage_note']}",
        f"- Tier: {meta['tier']} · Category: {meta['category']}",
        "",
        "### Methodology notes",
        "- Established methods: chunk-statistics descriptors (median/IQR/percentiles),",
        "  content-type distribution counting, page-coverage ratio.",
        "- Our framing: provenance classification, retrievability indicators,",
        "  quality-concern severity buckets.",
        "- PDF-specific notes: (none)",
        "",
        "### Indexing statistics [POPULATION]",
        f"- Total pages (manifest): {meta['page_count']}",
        f"- Total chunks: {p['total_chunks']}",
        f"- Pages with at least one chunk: {p['pages_with_chunks']}"
        f"{f' ({p['pages_with_chunks']/meta['page_count']:.0%})' if meta['page_count'] else ''}",
        f"- Chunk density (chunks/page): {p['chunk_density_per_page']}",
        f"- Chunk size (chars): {fmt_dist(cd, 'chars')}",
        f"- Suspicious-chunk counts: "
        f"under {SHORT_CHUNK_CAP} chars = {p['short_chunks_n']}; "
        f"over {LONG_CHUNK_CAP} chars = {p['long_chunks_n']}",
        f"- Content type distribution: "
        f"{ ', '.join(f'{k}={v}' for k, v in sorted(p['content_type_counts'].items(), key=lambda x: -x[1])) }",
        "",
        "### Topic coverage",
        f"- Topics this PDF contributes to ({len(p['topics_contributed_to'])}): "
        f"{ ', '.join(f'`{t}`' for t in p['topics_contributed_to']) or '(none)' }",
        f"- Topics where this PDF is the primary source "
        f"({len(p['topics_primary_source'])}): "
        f"{ ', '.join(f'`{t}`' for t in p['topics_primary_source']) or '(none)' }",
        "",
        "### Quality concerns",
    ]
    if p["concerns"]:
        for c in p["concerns"]:
            out.append(f"- {c['marker']} {c['issue']}")
    else:
        out.append("- [POPULATION] no concerns flagged by the automated heuristics "
                   f"(chunk-coverage ≥50%, short/long chunk rates within bounds).")
    out.append("")
    out.append("### Notes")
    out.append("- (none)")
    out.append("")
    return "\n".join(out)


def render_cross_pdf(cross: dict) -> str:
    out = [
        "## Section 3 — Cross-PDF comparisons",
        "",
        f"`[POPULATION]` Aggregations across all 75 PDFs.",
        "",
        "### Chunk density distribution (chunks per page, across PDFs)",
        f"- {fmt_dist(cross['chunk_density_dist'], 'chunks/page')}",
        "",
        "### Median chunk size distribution (median chars per PDF, across PDFs)",
        f"- {fmt_dist(cross['median_chunksize_dist'], 'chars')}",
        "",
        "### Page-coverage distribution (fraction of pages with at least one chunk, across PDFs)",
        f"- {fmt_dist(cross['page_coverage_dist'], '')}",
        "",
        "### Extraction method distribution",
    ]
    for method, n in sorted(cross["extraction_method_counts"].items(), key=lambda x: -x[1]):
        out.append(f"- {method}: {n}")
    out += ["",
            "### Global content type distribution",
            "| Content type | Count | % |",
            "| --- | --- | --- |"]
    total = sum(cross["content_type_global"].values()) or 1
    for ct, n in sorted(cross["content_type_global"].items(), key=lambda x: -x[1]):
        out.append(f"| {ct} | {n} | {n/total:.1%} |")
    out += ["",
            "### Top 10 PDFs by short-chunk concentration",
            "PDFs producing the most suspiciously-short chunks (<100 chars).",
            "Tail indicates likely OCR fragmentation or chunker edge cases.",
            "",
            "| Alias | Short chunks |",
            "| --- | --- |"]
    for alias, n in cross["top10_short_concentration"]:
        if n == 0:
            continue
        out.append(f"| `{alias}` | {n} |")
    out += ["",
            "### Top 10 PDFs by long-chunk concentration",
            "PDFs producing the most suspiciously-long chunks (>2000 chars).",
            "Tail indicates chunk-boundary detection failure.",
            "",
            "| Alias | Long chunks |",
            "| --- | --- |"]
    for alias, n in cross["top10_long_concentration"]:
        if n == 0:
            continue
        out.append(f"| `{alias}` | {n} |")
    out.append("")
    return "\n".join(out)


def render_topic_section(topic_aliases: dict[str, list[str]],
                         topic_summary: dict) -> str:
    out = [
        "## Section 4 — Topic and tier coverage",
        "",
        f"`[POPULATION]` {topic_summary['total_topics']} registered topics "
        f"mapped to PDFs via the `topics` table.",
        "",
        f"### Tier distribution",
    ]
    for tier, n in sorted(topic_summary["tier_counts"].items(),
                          key=lambda x: -x[1]):
        out.append(f"- {tier}: {n} PDFs")
    out += ["",
            "### Orphan topics (no PDF contributors)",
            f"`[POPULATION]` {len(topic_summary['orphan_topics'])} orphans."]
    if topic_summary["orphan_topics"]:
        out.append(", ".join(f"`{t}`" for t in topic_summary["orphan_topics"]))
    else:
        out.append("(none)")
    out += ["",
            "### Single-PDF topics",
            f"`[POPULATION]` Topics where retrieval is single-source — "
            f"a single point of failure if that PDF has quality issues.",
            f"Count: {len(topic_summary['single_pdf_topics'])}.",
            ""]
    if topic_summary["single_pdf_topics"]:
        out.append("| Topic | Sole PDF |")
        out.append("| --- | --- |")
        for t, alias in sorted(topic_summary["single_pdf_topics"].items()):
            out.append(f"| `{t}` | `{alias}` |")
    out += ["",
            "### Broad-coverage topics (5+ PDFs)",
            f"`[POPULATION]` Topics retrieval can answer from many sources.",
            f"Count: {len(topic_summary['broad_coverage_topics'])}.",
            ""]
    if topic_summary["broad_coverage_topics"]:
        out.append("| Topic | PDFs (count) |")
        out.append("| --- | --- |")
        for t, als in sorted(topic_summary["broad_coverage_topics"].items(),
                             key=lambda x: -len(x[1])):
            out.append(f"| `{t}` | {len(als)} ({', '.join(f'`{a}`' for a in als[:8])}{'…' if len(als) > 8 else ''}) |")
    out += ["",
            "### Full topic → PDF map",
            "(One entry per topic; sorted alphabetically.)",
            "",
            "| Topic | PDFs |",
            "| --- | --- |"]
    for t in sorted(topic_aliases.keys()):
        als = topic_aliases[t]
        out.append(f"| `{t}` | {', '.join(f'`{a}`' for a in als)} |")
    out.append("")
    return "\n".join(out)


def render_overlap_section(overlaps: dict) -> str:
    out = ["## Section 5 — Cross-alias overlap",
           "",
           "`[POPULATION]` Pairwise content overlap measured within "
           "variant alias families. For each page present in both aliases, "
           "all chunks at that page are concatenated and compared via "
           "`difflib.SequenceMatcher.ratio()`. Near-duplicate threshold: "
           "ratio ≥ 0.85.",
           ""]
    for fam_name, fam in overlaps.items():
        out.append(f"### `{fam_name}` family")
        out.append(f"Members present in corpus: {', '.join(f'`{m}`' for m in fam['members'])}")
        out.append("")
        if not fam["pairs"]:
            out.append("- No pairs to compare (fewer than 2 members present).")
            out.append("")
            continue
        out.append("| Pair | Shared pages | Mean ratio | Median ratio | Near-dup pages (≥0.85) | `a` only | `b` only |")
        out.append("| --- | --- | --- | --- | --- | --- | --- |")
        for pair in fam["pairs"]:
            o = pair["overlap"]
            out.append(
                f"| `{pair['a']}` × `{pair['b']}` | {o['shared_pages']} | "
                f"{o['mean_ratio']} | {o['median_ratio']} | "
                f"{o['near_duplicate_pages']} | {o['a_only']} | {o['b_only']} |"
            )
        out.append("")
    return "\n".join(out)


# ── Top-level ──────────────────────────────────────────────────────────────

def collect() -> dict:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    pdfs = load_pdfs(cur)
    chunks_by_alias = load_chunks_by_alias(cur)
    alias_topics, topic_aliases = load_topic_mapping(cur)
    primary = primary_topics_per_alias(topic_aliases)

    profiles = {}
    for alias, meta in pdfs.items():
        profiles[alias] = per_pdf_profile(
            meta, chunks_by_alias.get(alias, []),
            alias_topics.get(alias, []),
            primary.get(alias, []),
        )

    cross = cross_pdf_summary(profiles)
    topic_summary = topic_coverage(topic_aliases, pdfs)
    overlaps = compute_overlaps(chunks_by_alias)

    return {
        "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "db_path": str(DB_PATH),
        "pdfs": pdfs,
        "profiles": profiles,
        "cross": cross,
        "topic_aliases": topic_aliases,
        "topic_summary": topic_summary,
        "overlaps": overlaps,
    }


def render(data: dict) -> str:
    # Preserve the methodology / structural preamble; replace the
    # section-body placeholders with computed findings.
    pdfs = data["pdfs"]
    profiles = data["profiles"]
    out = []

    out.append("# Holocron Audit — Phase 1 (Level 1): Statistical Inventory")
    out.append("")
    out.append("PDF-as-variable structural audit of the indexed corpus. The retrieval")
    out.append("system serves 75 distinct PDFs, each with its own provenance, format")
    out.append("quality, and retrievability profile. This audit treats each PDF as an")
    out.append("independent variable and produces per-PDF profiles, then surfaces")
    out.append("cross-PDF patterns and corpus-level gaps.")
    out.append("")
    out.append(f"**Generated:** {data['generated_at']}")
    out.append("")
    out.append(f"**Source DB:** `{data['db_path']}`")
    out.append("")
    out.append("## Confidence calibration")
    out.append("")
    out.append("Every finding carries an explicit confidence marker per the contract")
    out.append("in [AUDIT.md](AUDIT.md):")
    out.append("- `[POPULATION]` — statistic computed over the full corpus (or the")
    out.append("  full population of a PDF). High confidence.")
    out.append("- `[SAMPLE n=X]` — based on probe queries / content sampling at size n.")
    out.append("- `[SINGLE-OBSERVATION]` — one or a few examples. Lowest confidence.")
    out.append("")
    out.append("Section 1 / 3 / 4 / 5 findings below are `[POPULATION]` unless")
    out.append("noted. Per-PDF profile quality concerns are `[POPULATION]` because")
    out.append("they're derived from chunk-statistics scans, not content sampling.")
    out.append("Section 5 overlap ratios are `[POPULATION]` (exhaustive pairwise).")
    out.append("")

    # Section 1
    out.append(render_inventory_section(pdfs))

    # Section 2
    out.append("## Section 2 — Per-PDF quality profiles")
    out.append("")
    out.append(f"`[POPULATION]` One profile per indexed PDF ({len(profiles)} total). "
               "Profiles are sorted alphabetically by alias.")
    out.append("")
    for alias in sorted(profiles.keys()):
        out.append(render_pdf_profile(profiles[alias]))

    # Section 3
    out.append(render_cross_pdf(data["cross"]))

    # Section 4
    out.append(render_topic_section(data["topic_aliases"], data["topic_summary"]))

    # Section 5
    out.append(render_overlap_section(data["overlaps"]))

    # Appendix
    out.append("## Appendix — Method notes")
    out.append("")
    out.append("- Data generation: `python3 -m swrpg_index.audit.level_1`")
    out.append("- Raw JSON artifact: `Docs/audit_artifacts/level_1_data.json`")
    out.append("- Source DB: read-only access via `swrpg_index.utils.DB_PATH`.")
    out.append("- Suspicious-chunk thresholds: short < 100 chars, long > 2000 chars.")
    out.append("- Near-duplicate threshold for cross-alias overlap: SequenceMatcher")
    out.append("  ratio ≥ 0.85 (per-page text concatenated within each alias).")
    out.append("- All claims are `[POPULATION]` unless explicitly labeled otherwise.")
    out.append("")
    return "\n".join(out)


def main() -> None:
    data = collect()
    ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    ARTIFACT_PATH.write_text(json.dumps(data, indent=2, default=str),
                              encoding="utf-8")
    REPORT_PATH.write_text(render(data), encoding="utf-8")
    print(f"Wrote artifact: {ARTIFACT_PATH}")
    print(f"Wrote report:   {REPORT_PATH}")
    print(f"Profiles:       {len(data['profiles'])}")
    print(f"Topics:         {len(data['topic_aliases'])}")
    print(f"Variant pairs:  "
          f"{sum(len(f['pairs']) for f in data['overlaps'].values())}")


if __name__ == "__main__":
    main()

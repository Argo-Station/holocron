"""The species-portrait manifest — what the app is allowed to believe exists on disk.

Plain summary: `speciesImgPath` used to BUILD a URL from a species name and hand it back without ever
checking that the file was there. For the ~190 species with no portrait that produced a truthy path,
which meant the designed Monogram placeholder never fired and the row rendered an empty grey tile
instead. With the Complete Species Guide switched on, the catalogue opened on a screenful of them —
which is the defect Jason reported as "the species selector doesn't have any images".

This writes the directory listing next to the files so the lookup can ask before it points. A name
with no file now falls to the Monogram, which is the shipped idiom for a portrait-less character
(`ui.jsx` Monogram, the seam the whole app fell back to after the Nunes retirement).

WHY A MANIFEST AND NOT AN `onError` SWAP: the app already loads every other catalogue fact through
`loadCanonicalCharacterBuild`'s fetch-once/cache-on-window pattern, and the species browser cannot
render before that promise settles — so a manifest is ordered by construction, with no flash of a
placeholder and no wave of 404s. It is also the idiom the vehicle art already uses
(`build_vehicle_image_manifest.py`).

Kept honest by `test/species_portrait_manifest.cjs`, which fails when the manifest and the directory
disagree in either direction. Re-run this after any change to the pack.

Run: .venv/bin/python scripts/canonical/build_species_portrait_manifest.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "public" / "SWDataSet-Master" / "species_portraits"
MANIFEST = PACK / "manifest.json"


SHIP = ROOT / "public" / "data" / "canonical" / "species.json"


def _stem(name):
    """The app's own rule — `speciesPortraitStem` in player/index.html."""
    return str(name or "").replace(" ", "_").replace("'", "").replace("’", "")


def _by_id(files, prev):
    """C-ART-6 — the id→file binding, FROZEN once made.

    THE DEFECT THIS ENDS: `speciesImgPath` resolved a portrait from the RENDERED NAME, so renaming a
    species silently detached its art. Not hypothetical — the v7 import expanded `Kowakian` to
    `Kowakian monkey-lizard` and `Terrelian Jango` to `Terrelian Jango Jumper`, and both have working
    portraits on the live site that stopped resolving the moment the name moved. An id is the save
    contract and never changes (`source-modification-is-permitted` §15, charter §8); a name is a
    display field and is allowed to.

    A BINDING IS NEVER DROPPED BECAUSE A NAME MOVED — only because its FILE is gone. That is what
    makes the map survive a rename: once `csg_kowakian → Kowakian.webp` is recorded, the record can
    be called anything.

    THREE DERIVATIONS, in order, and the third is why this needs no hand-maintained alias table:
      1. an existing binding whose file is still on disk — kept verbatim;
      2. the record's CURRENT name, through the app's own stem rule;
      3. the ID ITSELF, `csg_` stripped, matched case-insensitively. Ids are slugged from the name
         a record had when it was first imported, so a renamed record still carries its own history
         — which is exactly how `csg_kowakian` finds `Kowakian.webp` after the rename.
    """
    have = {f.lower(): f for f in files}
    ship = json.loads(SHIP.read_text())["species"]
    out, how = {}, {"kept": 0, "by_name": 0, "by_id_stem": 0}
    for sid, rec in ship.items():
        f = prev.get(sid)
        if f and f in have.values():
            out[sid], how["kept"] = f, how["kept"] + 1
            continue
        cand = _stem(rec.get("name")) + ".webp"
        if cand.lower() in have:
            out[sid], how["by_name"] = have[cand.lower()], how["by_name"] + 1
            continue
        bare = sid[4:] if sid.startswith("csg_") else sid
        cand2 = bare + ".webp"
        if cand2.lower() in have:
            out[sid], how["by_id_stem"] = have[cand2.lower()], how["by_id_stem"] + 1
    return out, how


def build():
    files = sorted(p.name for p in PACK.iterdir() if p.suffix == ".webp")
    prev = {}
    if MANIFEST.exists():
        prev = (json.loads(MANIFEST.read_text()) or {}).get("by_id") or {}
    by_id, how = _by_id(files, prev)
    payload = {
        "schema": "species-portrait-manifest",
        "schema_version": 2,
        "generated_by": "scripts/canonical/build_species_portrait_manifest.py",
        "count": len(files),
        "files": files,
        # C-ART-6: resolution keys off the id. `files` stays as the existence check and the
        # name path stays as the fallback, so nothing that resolves today stops resolving.
        "by_id": dict(sorted(by_id.items())),
    }
    MANIFEST.write_text(json.dumps(payload, indent=1) + "\n", encoding="utf-8")
    payload["_how"] = how
    return payload


if __name__ == "__main__":
    result = build()
    print("wrote %s — %d portraits" % (MANIFEST.relative_to(ROOT), result["count"]))

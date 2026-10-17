"""Copy a certified research release into the static site and switch its pointer.

The source release stays immutable. Nothing is published until every artifact
and its current upstream lineage passes ResearchReleaseManager certification.
"""
from __future__ import annotations

import argparse
import json
import shutil
import uuid
from pathlib import Path

from StockMe.core.config.paths import WORKSPACE_ROOT
from StockMe.core.research.release import ResearchReleaseManager


def publish(release_id: str, site_root: Path, *, preview: bool = False, rights_attestation: Path | None = None) -> Path:
    if not preview:
        if not rights_attestation or not rights_attestation.is_file():
            raise ValueError("Public publication requires a source-rights attestation")
        rights = json.loads(rights_attestation.read_text(encoding="utf-8"))
        if (rights.get("approved_by") in (None, "") or not rights.get("approved_at")
                or rights.get("price_display_and_redistribution") is not True
                or rights.get("filing_derived_display_and_redistribution") is not True):
            raise ValueError("Source-rights attestation is incomplete")
    manager = ResearchReleaseManager()
    source = manager.releases_dir / release_id
    if manager.get_current_release_id() != release_id:
        raise ValueError("Only the active research release can be published")
    valid, errors = manager.certify_candidate(source)
    if not valid:
        raise ValueError(f"Research release failed certification: {errors[:12]}")
    research_root = site_root / "research"
    releases_dir = research_root / "releases"
    releases_dir.mkdir(parents=True, exist_ok=True)
    destination = releases_dir / release_id
    if destination.exists():
        valid, errors = manager.certify_candidate(destination)
        if not valid or (destination / "manifest.json").read_bytes() != (source / "manifest.json").read_bytes():
            raise FileExistsError(f"Existing static release is different or invalid: {destination}; {errors[:5]}")
    else:
        staging = releases_dir / f".{release_id}.staging.{uuid.uuid4().hex[:6]}"
        try:
            shutil.copytree(source, staging)
            valid, errors = manager.certify_candidate(staging)
            if not valid:
                raise ValueError(f"Copied research release failed certification: {errors[:12]}")
            staging.rename(destination)
        finally:
            if staging.exists():
                shutil.rmtree(staging)
    manifest = json.loads((destination / "manifest.json").read_text(encoding="utf-8"))
    pointer = {
        "schema_version": 1,
        "release_id": release_id,
        "manifest_hash": manifest["manifest_hash"],
        "ratios_index": f"releases/{release_id}/ratios_index.json",
        "status": "PREVIEW" if preview else "CERTIFIED_ACTIVE",
    }
    temp = research_root / f".current.{uuid.uuid4().hex[:6]}.json"
    temp.write_text(json.dumps(pointer, indent=2, sort_keys=True), encoding="utf-8")
    temp.replace(research_root / "current.json")
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("release_id")
    parser.add_argument("--site-root", type=Path, default=WORKSPACE_ROOT / "stockerboard_repo")
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--rights-attestation", type=Path)
    args = parser.parse_args()
    print(publish(args.release_id, args.site_root, preview=args.preview, rights_attestation=args.rights_attestation))

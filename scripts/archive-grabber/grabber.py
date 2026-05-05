#!/usr/bin/env python3
"""
archive-grabber: Download high-quality live concert recordings from archive.org.

Usage:
  python grabber.py --config config.yaml [--artist "Grateful Dead"] [--dry-run] [--log-file /path/to/log]
"""

import argparse
import json
import logging
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import internetarchive as ia
import yaml
from mutagen.flac import FLAC

STATE_FILE = Path(__file__).parent / "state.json"

SOURCE_RANK = {"SBD": 3, "FM": 2, "AUD": 1}

LOSSLESS_EXTS = {".flac", ".shn"}
LOSSY_EXTS = {".mp3", ".ogg", ".aac", ".m4a"}
METADATA_EXTS = {".txt", ".md5", ".ffp", ".nfo"}


def setup_logging(log_file=None):
    handlers = [logging.StreamHandler(sys.stdout)]
    if log_file:
        handlers.append(logging.FileHandler(log_file))
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=handlers,
    )


def load_config(path):
    with open(path) as f:
        return yaml.safe_load(f)


def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {}


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def detect_source(metadata):
    """Extract source type (SBD/FM/AUD) from item metadata."""
    for field in ("source", "subject", "description", "notes"):
        val = metadata.get(field, "")
        if isinstance(val, list):
            val = " ".join(val)
        val = val.upper()
        if "SBD" in val or "SOUNDBOARD" in val:
            return "SBD"
        if "FM" in val or "BROADCAST" in val or "RADIO" in val:
            return "FM"
        if "AUD" in val or "AUDIENCE" in val:
            return "AUD"
    return "AUD"  # default to AUD if unknown


def score_item(metadata, allowed_sources):
    source = detect_source(metadata)
    if source not in allowed_sources:
        return None, source

    rank = SOURCE_RANK.get(source, 0)
    avg_rating = float(metadata.get("avg_rating") or 0)
    num_reviews = int(metadata.get("num_reviews") or 0)
    tiebreaker = avg_rating * math.log(num_reviews + 1)
    return rank * 10 + tiebreaker, source


def parse_show_folder(metadata, identifier):
    """Build a folder name like '1977-05-08 Barton Hall, Ithaca'."""
    date = (metadata.get("date") or "")[:10]  # YYYY-MM-DD
    coverage = metadata.get("coverage", "")
    title = metadata.get("title", "")

    # Try to extract a venue/city from coverage or title
    location = coverage.strip() if coverage else ""
    if not location and title:
        # Strip date-like prefix from title if present
        location = re.sub(r"^\d{4}-\d{2}-\d{2}\s*", "", title).strip()

    if date and location:
        folder = f"{date} {location}"
    elif date:
        folder = date
    else:
        folder = identifier

    # Sanitize for filesystem
    folder = re.sub(r'[<>:"/\\|?*]', "-", folder)
    return folder


def tag_flac(path, artist, album, date):
    try:
        audio = FLAC(path)
        audio["artist"] = artist
        audio["albumartist"] = artist
        audio["album"] = album
        audio["date"] = date
        audio.save()
    except Exception as e:
        logging.warning(f"  tagging failed for {Path(path).name}: {e}")


def has_lossless(item):
    """Return True if the item has any FLAC or SHN files."""
    for f in item.get_files():
        if Path(f.name).suffix.lower() in LOSSLESS_EXTS:
            return True
    return False


def download_item(item, dest_dir, dry_run):
    """Download FLAC files; convert SHN to FLAC. Returns list of downloaded paths."""
    dest_dir = Path(dest_dir)
    if not dry_run:
        dest_dir.mkdir(parents=True, exist_ok=True)

    downloaded = []
    to_convert = []

    for f in item.get_files():
        ext = Path(f.name).suffix.lower()
        if ext in LOSSY_EXTS:
            continue
        if ext not in LOSSLESS_EXTS and ext not in METADATA_EXTS:
            continue

        dest_path = dest_dir / f.name
        if dry_run:
            logging.info(f"  [dry-run] would download: {f.name}")
            downloaded.append(str(dest_path))
            if ext == ".shn":
                to_convert.append(str(dest_path))
            continue

        logging.info(f"  downloading: {f.name}")
        f.download(destdir=str(dest_dir), ignore_existing=False, retries=3)
        downloaded.append(str(dest_path))
        if ext == ".shn":
            to_convert.append(str(dest_path))


    for shn_path in to_convert:
        flac_path = shn_path.replace(".shn", ".flac")
        if dry_run:
            logging.info(f"  [dry-run] would convert: {Path(shn_path).name} -> {Path(flac_path).name}")
            continue
        logging.info(f"  converting: {Path(shn_path).name} -> {Path(flac_path).name}")
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", shn_path, flac_path],
            capture_output=True,
        )
        if result.returncode == 0:
            os.remove(shn_path)
            downloaded = [flac_path if p == shn_path else p for p in downloaded]
        else:
            logging.warning(f"  ffmpeg failed for {shn_path}: {result.stderr.decode()[:200]}")

    return downloaded


def process_artist(artist_cfg, output_dir, state, dry_run):
    name = artist_cfg["name"]
    collections = artist_cfg.get("collections", [])
    search_query = artist_cfg.get("search_query")
    allowed_sources = artist_cfg.get("sources", ["SBD", "FM", "AUD"])
    date_range = artist_cfg.get("date_range")
    min_rating = artist_cfg.get("min_rating")

    logging.info(f"=== {name} ===")

    artist_state = state.setdefault(name, {})

    # Collect all candidates across collections (or a freeform query), grouped by date
    candidates_by_date = {}

    def run_query(query, label):
        logging.info(f"  searching {label}...")
        try:
            results = ia.search_items(
                query,
                fields=["identifier", "date", "title", "coverage", "source",
                        "subject", "avg_rating", "num_reviews", "description", "downloads"],
            )
            for result in results:
                identifier = result.get("identifier")
                if not identifier:
                    continue
                date = (result.get("date") or "")[:10]
                if not date:
                    continue
                candidates_by_date.setdefault(date, []).append(result)
        except Exception as e:
            logging.warning(f"  search failed for {label}: {e}")

    if search_query:
        q = search_query
        if date_range:
            q += f" date:[{date_range[0]} TO {date_range[1]}]"
        run_query(q, "custom query")
    else:
        for collection in collections:
            q = f"collection:{collection} mediatype:etree"
            if date_range:
                q += f" date:[{date_range[0]} TO {date_range[1]}]"
            if min_rating is not None:
                q += f" avg_rating:[{min_rating} TO null]"
            run_query(q, collection)

    logging.info(f"  found {sum(len(v) for v in candidates_by_date.values())} candidates across {len(candidates_by_date)} dates")

    downloaded_count = 0
    skipped_count = 0

    for date, candidates in sorted(candidates_by_date.items()):
        # Score and pick best candidate
        best = None
        best_score = -1
        best_source = None

        for candidate in candidates:
            if min_rating is not None:
                avg_rating = float(candidate.get("avg_rating") or 0)
                num_reviews = int(candidate.get("num_reviews") or 0)
                if avg_rating < min_rating or num_reviews == 0:
                    continue
            score, source = score_item(candidate, allowed_sources)
            if score is None:
                continue
            if score > best_score:
                best_score = score
                best = candidate
                best_source = source

        if best is None:
            continue

        identifier = best["identifier"]
        existing = artist_state.get(date)

        if existing and existing.get("score", -1) >= best_score:
            skipped_count += 1
            logging.debug(f"  {date}: skip (have score {existing['score']:.1f} >= {best_score:.1f})")
            continue

        action = "overwriting" if existing else "downloading"
        logging.info(f"  {date}: {action} [{best_source}] score={best_score:.1f} — {identifier}")

        try:
            item = ia.get_item(identifier)
            if not has_lossless(item):
                logging.info(f"  {date}: no lossless files, skipping")
                continue

            show_folder = parse_show_folder(best, identifier)
            dest_dir = Path(output_dir) / name / show_folder

            paths = download_item(item, dest_dir, dry_run)

            if not dry_run:
                for p in paths:
                    if p.endswith(".flac"):
                        tag_flac(p, name, show_folder, date)


                artist_state[date] = {
                    "identifier": identifier,
                    "score": best_score,
                    "source": best_source,
                    "path": str(dest_dir),
                }
                save_state(state)

            downloaded_count += 1

        except Exception as e:
            logging.error(f"  {date}: failed — {e}")

    logging.info(f"  {name}: {downloaded_count} downloaded, {skipped_count} skipped")


def main():
    parser = argparse.ArgumentParser(description="Download live concerts from archive.org")
    parser.add_argument("--config", required=True, help="Path to config.yaml")
    parser.add_argument("--artist", help="Artist name (required with --query; filters config otherwise)")
    parser.add_argument("--query", help="Raw IA query — bypasses config, uses --artist for output dir")
    parser.add_argument("--sources", help="Comma-separated source types for --query mode (default: SBD,FM,AUD)")
    parser.add_argument("--dry-run", action="store_true", help="Log actions without downloading")
    parser.add_argument("--log-file", help="Also write logs to this file")
    args = parser.parse_args()

    setup_logging(args.log_file)

    config = load_config(args.config)
    output_dir = config["output_dir"]

    if args.dry_run:
        logging.info("DRY RUN — no files will be written")

    state = load_state()

    if args.query:
        if not args.artist:
            logging.error("--query requires --artist")
            sys.exit(1)
        sources = [s.strip() for s in args.sources.split(",")] if args.sources else ["SBD", "FM", "AUD"]
        artist_cfg = {
            "name": args.artist,
            "search_query": args.query,
            "sources": sources,
        }
        process_artist(artist_cfg, output_dir, state, args.dry_run)
    else:
        artists = config["artists"]
        if args.artist:
            artists = [a for a in artists if a["name"] == args.artist]
            if not artists:
                logging.error(f"No artist named '{args.artist}' found in config")
                sys.exit(1)
        for artist_cfg in artists:
            process_artist(artist_cfg, output_dir, state, args.dry_run)

    logging.info("Done.")


if __name__ == "__main__":
    main()

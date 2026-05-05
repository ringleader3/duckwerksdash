#!/usr/bin/env python3
"""
backfill-track-titles: Parse setlist txt files and write title tags to FLACs.

Looks for the main .txt file in each show folder, parses track listings,
and writes title tags to matching FLAC files by track number.

Usage:
  python backfill-track-titles.py --config config.yaml [--artist "Steve Kimock"] [--dry-run]
"""

import argparse
import logging
import re
import sys
from pathlib import Path

import yaml
from mutagen.flac import FLAC


def setup_logging():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", handlers=[logging.StreamHandler(sys.stdout)])


def parse_tracks(txt_path):
    """
    Parse a setlist txt file and return a flat list of track titles in order.
    Returns empty list if no tracks found.
    """
    try:
        text = txt_path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return []

    tracks = []

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue

        # Skip lines that are just dates (e.g. "1997-01-04" or "12-29-86")
        if re.match(r'^\d{1,4}[-/]\d{1,2}[-/]\d{2,4}$', line):
            continue

        # Match: "01. Title", "1. Title", "01 Title  8:23", "1 - Title", "1) Title"
        m = re.match(r'^(?:cd\s*\d+\s+)?(\d+)[.)\-\s]+(.+?)(?:\s+[\d:]+\s*)?$', line, re.IGNORECASE)
        if not m:
            continue

        title = m.group(2).strip()

        # Strip leading junk like ") " that can bleed in from formats like "1) Title"
        title = re.sub(r'^\)+\s*', '', title).strip()

        # Skip lines that look like headers or metadata
        if re.search(r'(source|transfer|lineage|recorded|total|disc|set|show|taped|by:|>)', title, re.IGNORECASE):
            continue
        if len(title) < 2 or len(title) > 100:
            continue

        # Strip trailing transition markers like ">", "->", ">"
        title = re.sub(r'\s*[-–>]+\s*$', '', title).strip()

        if title:
            tracks.append(title)

    return tracks


def find_setlist_txt(show_dir):
    """Find the most likely setlist txt file in a show folder."""
    txts = [f for f in show_dir.glob("*.txt") if "ffp" not in f.name.lower() and "md5" not in f.name.lower()]
    if not txts:
        return None
    # Prefer shorter filenames (less likely to be a sub-file)
    return sorted(txts, key=lambda f: len(f.name))[0]


def get_flac_files(show_dir):
    """Return FLAC files sorted by filename (track order)."""
    return sorted(show_dir.glob("*.flac"))


def tag_titles(show_dir, tracks, dry_run):
    flacs = get_flac_files(show_dir)

    if not flacs:
        return 0

    if len(tracks) != len(flacs):
        logging.warning(f"  {show_dir.name}: {len(tracks)} tracks parsed but {len(flacs)} FLACs — skipping")
        return 0

    tagged = 0
    for i, (flac_path, title) in enumerate(zip(flacs, tracks), 1):
        if dry_run:
            logging.info(f"  [dry-run] {flac_path.name} -> title={title!r}")
        else:
            try:
                audio = FLAC(flac_path)
                audio["title"] = title
                audio["tracknumber"] = str(i)
                audio.save()
                tagged += 1
            except Exception as e:
                logging.warning(f"  failed: {flac_path.name}: {e}")

    return len(tracks) if dry_run else tagged


def process_artist(artist_name, artist_dir, dry_run):
    logging.info(f"=== {artist_name} ===")

    tagged_shows = 0
    skipped_shows = 0

    for show_dir in sorted(artist_dir.iterdir()):
        if not show_dir.is_dir():
            continue

        txt = find_setlist_txt(show_dir)
        if not txt:
            logging.debug(f"  {show_dir.name}: no txt file")
            skipped_shows += 1
            continue

        tracks = parse_tracks(txt)
        if not tracks:
            logging.debug(f"  {show_dir.name}: no tracks parsed from {txt.name}")
            skipped_shows += 1
            continue

        logging.info(f"  {show_dir.name}: {len(tracks)} tracks from {txt.name}")
        n = tag_titles(show_dir, tracks, dry_run)
        if n > 0:
            tagged_shows += 1
        else:
            skipped_shows += 1

    logging.info(f"  {artist_name}: {tagged_shows} shows tagged, {skipped_shows} skipped")


def main():
    parser = argparse.ArgumentParser(description="Backfill track title tags from setlist txt files")
    parser.add_argument("--config", required=True, help="Path to config.yaml")
    parser.add_argument("--artist", help="Only process this artist")
    parser.add_argument("--dry-run", action="store_true", help="Log without writing")
    args = parser.parse_args()

    setup_logging()

    with open(args.config) as f:
        config = yaml.safe_load(f)

    output_dir = Path(config["output_dir"])

    artists = config["artists"]
    if args.artist:
        artists = [a for a in artists if a["name"] == args.artist]
        if not artists:
            logging.error(f"No artist named '{args.artist}' in config")
            sys.exit(1)

    for artist_cfg in artists:
        artist_name = artist_cfg["name"]
        artist_dir = output_dir / artist_name
        if not artist_dir.exists():
            continue
        process_artist(artist_name, artist_dir, args.dry_run)

    logging.info("Done.")


if __name__ == "__main__":
    main()

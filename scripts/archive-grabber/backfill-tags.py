#!/usr/bin/env python3
"""
backfill-tags: Write artist/album/date ID3 tags to already-downloaded FLAC files.

Derives tags from folder structure: {output_dir}/{Artist}/{YYYY-MM-DD Show}/files.flac

Usage:
  python backfill-tags.py --config config.yaml [--dry-run]
"""

import argparse
import logging
import sys
from pathlib import Path

import yaml
from mutagen.flac import FLAC


def setup_logging():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", handlers=[logging.StreamHandler(sys.stdout)])


def tag_flac(path, artist, album, date, dry_run):
    if dry_run:
        logging.info(f"  [dry-run] would tag: {path.name} — artist={artist}, album={album}, date={date}")
        return
    try:
        audio = FLAC(path)
        audio["artist"] = artist
        audio["albumartist"] = artist
        audio["album"] = album
        audio["date"] = date
        audio.save()
    except Exception as e:
        logging.warning(f"  failed: {path.name}: {e}")


def main():
    parser = argparse.ArgumentParser(description="Backfill ID3 tags on downloaded FLAC files")
    parser.add_argument("--config", required=True, help="Path to config.yaml")
    parser.add_argument("--dry-run", action="store_true", help="Log without writing")
    args = parser.parse_args()

    setup_logging()

    with open(args.config) as f:
        config = yaml.safe_load(f)

    output_dir = Path(config["output_dir"])

    for artist_cfg in config["artists"]:
        artist_name = artist_cfg["name"]
        artist_dir = output_dir / artist_name

        if not artist_dir.exists():
            continue

        logging.info(f"=== {artist_name} ===")
        tagged = 0

        for show_dir in sorted(artist_dir.iterdir()):
            if not show_dir.is_dir():
                continue

            # Extract date from folder name (first 10 chars if YYYY-MM-DD)
            folder_name = show_dir.name
            date = folder_name[:10] if len(folder_name) >= 10 and folder_name[4] == "-" else ""

            for flac_file in show_dir.glob("*.flac"):
                tag_flac(flac_file, artist_name, folder_name, date, args.dry_run)
                tagged += 1

        logging.info(f"  {artist_name}: {tagged} files {'would be ' if args.dry_run else ''}tagged")

    logging.info("Done.")


if __name__ == "__main__":
    main()

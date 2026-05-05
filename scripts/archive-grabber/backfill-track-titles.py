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
    pending_medley = None  # title being built up across continuation lines

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue

        # Skip lines that are just dates (e.g. "1997-01-04" or "12-29-86")
        if re.match(r'^\d{1,4}[-/]\d{1,2}[-/]\d{2,4}$', line):
            continue

        # Stop if we've hit technical notes after the setlist
        if tracks and re.search(r'\b(fix|silence|repair|dropout|sector|extraction|encode|static|DAE|overread|overwrite|burner|retransfer)\b', line, re.IGNORECASE):
            break
        if re.match(r'^(comments?|notes?|source|transfer|lineage|recorded|uploaded|edited)\s*:', line, re.IGNORECASE):
            break

        # If we're mid-medley, check if this is a continuation line (no leading track number)
        if pending_medley is not None:
            m_cont = re.match(r'^(?:cd\s*\d+\s+)?(\d+)[.)\-\s]+', line, re.IGNORECASE)
            if not m_cont:
                # Continuation line — strip timing, append to medley
                cont = re.sub(r'\s+[\d:]+\s*$', '', line).strip()
                cont = re.sub(r'\s*[-–>]+\s*$', '', cont).strip()
                if cont:
                    pending_medley += ' > ' + cont
                # If this continuation line also ends with ->, keep accumulating
                if re.search(r'[-–>]+\s*$', line):
                    continue
                else:
                    tracks.append(pending_medley)
                    pending_medley = None
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

        # Check if this track ends with -> (medley start)
        if re.search(r'[-–>]+\s*$', title):
            title = re.sub(r'\s*[-–>]+\s*$', '', title).strip()
            pending_medley = title
            continue

        if title:
            tracks.append(title)

    # Flush any pending medley at end of file
    if pending_medley:
        tracks.append(pending_medley)

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


def title_from_filename(flac_path):
    """Extract title from filename if it contains a human-readable title after a dash.
    e.g. 'Disc101-Juke.flac' -> 'Juke'
         'skf1997-01-04d1t01.flac' -> None  (date/track code, not a title)
    """
    stem = flac_path.stem
    # Match prefix of letters+digits followed by dash and the rest
    m = re.match(r'^[A-Za-z]*\d+[-_](.+)$', stem)
    if not m:
        return None
    title = m.group(1).strip()
    # Reject if it looks like a date fragment (MM-DD, YYYY-MM-DD)
    if re.match(r'^\d{2}-\d{2}', title):
        return None
    # Reject if it looks like a disc/track code (d1t01, t01, etc.)
    if re.match(r'^[dt]\d+', title, re.IGNORECASE):
        return None
    # Reject if it's all digits/codes with no real words
    if not re.search(r'[A-Za-z]{2,}', title):
        return None
    return title


def disc_track_label(flac_path):
    """Generate a 'Disc X Track Y' label from filename patterns like d1t03 or d2t01."""
    stem = flac_path.stem
    m = re.search(r'd(\d+)t(\d+)', stem, re.IGNORECASE)
    if m:
        return f"Disc {int(m.group(1))} Track {int(m.group(2))}"
    # Fallback: just track number from any trailing digits
    m = re.search(r'(\d+)$', stem)
    if m:
        return f"Track {int(m.group(1))}"
    return None


def resolve_titles(show_dir, txt_tracks):
    """
    Resolve titles for each FLAC in show_dir using priority:
    1. Title embedded in filename
    2. txt setlist (only if count matches)
    3. Disc X Track Y from filename pattern
    4. None (no-op)
    """
    flacs = get_flac_files(show_dir)
    if not flacs:
        return []

    results = []

    # Check if all filenames have embedded titles
    filename_titles = [title_from_filename(f) for f in flacs]
    if all(t is not None for t in filename_titles):
        return list(zip(flacs, filename_titles, ['filename'] * len(flacs)))

    # Try txt setlist if count matches
    if txt_tracks and len(txt_tracks) == len(flacs):
        return list(zip(flacs, txt_tracks, ['txt'] * len(flacs)))

    if txt_tracks and len(txt_tracks) != len(flacs):
        logging.warning(f"  {show_dir.name}: {len(txt_tracks)} txt tracks but {len(flacs)} FLACs — falling back to disc/track labels")

    # Fall back to Disc X Track Y
    for flac_path in flacs:
        label = disc_track_label(flac_path)
        results.append((flac_path, label, 'pattern' if label else 'noop'))

    return results


def tag_show(show_dir, txt_tracks, dry_run):
    resolved = resolve_titles(show_dir, txt_tracks)
    if not resolved:
        return 0

    tagged = 0
    for i, (flac_path, title, source) in enumerate(resolved, 1):
        if title is None:
            continue
        if dry_run:
            logging.info(f"  [dry-run] [{source}] {flac_path.name} -> {title!r}")
        else:
            try:
                audio = FLAC(flac_path)
                audio["title"] = title
                audio["tracknumber"] = str(i)
                audio.save()
                tagged += 1
            except Exception as e:
                logging.warning(f"  failed: {flac_path.name}: {e}")

    return len(resolved) if dry_run else tagged


def process_artist(artist_name, artist_dir, dry_run):
    logging.info(f"=== {artist_name} ===")

    tagged_shows = 0
    skipped_shows = 0

    for show_dir in sorted(artist_dir.iterdir()):
        if not show_dir.is_dir():
            continue

        txt = find_setlist_txt(show_dir)
        txt_tracks = parse_tracks(txt) if txt else []

        logging.info(f"  {show_dir.name}: {len(txt_tracks)} txt tracks" + (f" from {txt.name}" if txt else ""))
        n = tag_show(show_dir, txt_tracks, dry_run)
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

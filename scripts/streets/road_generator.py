"""Offline street-name generator (tasks.md item 13).

Asks the OpenStreetMap Overpass API for the named streets of a real city and writes them to
data/street-names/<city>.json. Run it once on your machine; the game never calls Overpass.

    python scripts/streets/road_generator.py "San Francisco" "Amsterdam" --limit 60
    python scripts/streets/road_generator.py --districts      # the district -> city table below

Needs only `requests`. Street names are (c) OpenStreetMap contributors, ODbL: keep the
attribution that the script writes into every file.
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OUT_DIR = Path(__file__).resolve().parents[2] / "data" / "street-names"
HEADERS = {"User-Agent": "VoxelVenture-street-names/1.0 (offline script)"}
ATTRIBUTION = "Street names (c) OpenStreetMap contributors, ODbL 1.0 - https://www.openstreetmap.org/copyright"
HIGHWAYS = "residential|tertiary|secondary|primary|unclassified|living_street|pedestrian"

# Which real city lends its street names to which district of the game.
DISTRICT_SOURCES = {
    "Silicon Strip": "San Francisco",
    "Bazaar Market": "Marrakech",
    "Creative Quarter": "Berlin",
    "Arcade Alley": "Tokyo",
}

MAX_LEN = 22  # the road labels in the game are short


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def clean(name):
    """A name the game can show, or None."""
    name = re.sub(r"\s+", " ", name).strip()
    if not name or len(name) > MAX_LEN or len(name) < 3:
        return None
    if re.search(r"\d{2,}", name):  # route numbers such as "A100" or "Route 66"
        return None
    if not re.search(r"[^\W\d_]", name):
        return None
    return name


def fetch_city_street_names(city, limit=100, retries=3):
    query = f"""
    [out:json][timeout:60];
    area[name="{city}"]["boundary"="administrative"]->.a;
    way["highway"~"^({HIGHWAYS})$"]["name"](area.a);
    out tags {limit * 8};
    """
    for attempt in range(retries):
        r = requests.post(OVERPASS_URL, data={"data": query}, headers=HEADERS, timeout=90)
        if r.status_code == 200:
            break
        if r.status_code in (429, 502, 503, 504) and attempt < retries - 1:
            time.sleep(10 * (attempt + 1))  # the public server asks you to slow down
            continue
        raise RuntimeError(f"Overpass error {r.status_code} for {city}")
    names = set()
    for el in r.json().get("elements", []):
        n = clean(el.get("tags", {}).get("name", ""))
        if n:
            names.add(n)
    return sorted(names)[:limit]


def write_city(city, limit):
    names = fetch_city_street_names(city, limit)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{slug(city)}.json"
    path.write_text(json.dumps({"city": city, "attribution": ATTRIBUTION, "names": names}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{city}: {len(names)} names -> {path}")
    return path


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cities", nargs="*", help="city names as OpenStreetMap spells them")
    ap.add_argument("--limit", type=int, default=60, help="names to keep per city")
    ap.add_argument("--districts", action="store_true", help="fetch the cities in DISTRICT_SOURCES")
    args = ap.parse_args(argv)
    cities = list(args.cities)
    if args.districts:
        cities += [c for c in DISTRICT_SOURCES.values() if c not in cities]
    if not cities:
        ap.error("give at least one city, or --districts")
    failed = 0
    for i, city in enumerate(cities):
        try:
            write_city(city, args.limit)
        except Exception as e:  # keep going: one bad city should not lose the others
            failed += 1
            print(f"{city}: failed ({e})", file=sys.stderr)
        if i < len(cities) - 1:
            time.sleep(2)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

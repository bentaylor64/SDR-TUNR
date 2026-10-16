# Bundled browser directory snapshots

These tiles are a lossless geographic partition of the native SDR-TUNR 1.14.0 files:

- `Sources/Tuner/Resources/airports.json`: FAA NASR cycle 2026-09-03; OurAirports IATA metadata; 18,338 records.
- `Sources/Tuner/Resources/repeaters.json`: HearHam downloaded 2026-09-12; 9,102 records (9,081 ham and 21 GMRS).

`catalogs.json` retains each source's original top-level attribution and metadata, the native file SHA-256, and tile record counts. Every station preserves its source URL, source/download date, coordinates, labels and details. Files under `airports/` and `repeaters/` are JSON arrays indexed by the lower latitude and longitude of a 2° cell.

Directory records are published candidates, not proof of reception. A repeater download date is not a verification date. National channel plans are declared separately in `directory.js` and have no invented local coordinates.

Regenerate from the native snapshots with `python3 scripts/build-web-catalogs.py`. Use `python3 scripts/build-web-catalogs.py --check` to verify generated files without changing them. Neither command fetches network data.

Run the model test suite after updating the native snapshots and regenerating the tiles; it verifies every browser record against the source records and hashes. The browser never downloads these full catalogs at startup.

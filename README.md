# Home shortlist

A responsive comparison page for 26 saved Zillow homes, captured on October 25, 2026. Each card includes its listing thumbnail, price, bedrooms, bathrooms, interior area, lot size, and a link to Zillow.

This is a snapshot. It does not sync with Zillow or update prices and availability automatically; the linked listing is the place to check current details. Listing photos and MLS attribution remain associated with their original listings.

## Run locally

Python 3 is sufficient; no package installation or build step is required.

```sh
python3 -m http.server 8846 --bind 127.0.0.1 --directory public
```

The page is served at `http://127.0.0.1:8846/`.

## Verify data

```sh
python3 -m unittest test_data.py
node --test tests/ui.test.cjs
```

The tests check the complete collection, required card fields, Zillow links, valid thumbnail files, and lot-area formatting. Browser verification should additionally check desktop and mobile layouts and the listing links.

`extract_homes.py` can recreate `public/homes.json` and its thumbnail files from local browser exports in `source/`. Those exports are deliberately excluded from Git because they may include account data. Run the extractor only when the intended exports are available locally.

## Hosting

GitHub Pages serves only `public/` through `.github/workflows/pages.yml`. The workflow runs on pushes to `main` and can also be started manually. Repository scripts, tests, documentation, and local exports are not uploaded as site content.

The host was selected using the AI toolkit's [free-for-dev reference](https://github.com/ripienaar/free-for-dev/tree/4dbda5ecff8f86164338dd50bd59f9920752ad5c). As verified October 25, 2026, [GitHub Pages is free for public repositories](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), with a 1 GB published-site limit and a soft bandwidth limit of 100 GB per month. No paid services or Vercel resources are required.

Enable GitHub Actions as the Pages publishing source before deploying. The repository and published site are public.

## Map view

The List / Map control at the top switches views; each visit starts in List view. Search and city filters stay in sync. Map groups expand into price markers as you zoom; selecting a marker opens a photo and property preview with a Zillow link. “Show all results” fits the current selection again.

Coordinates come from the same Zillow listing snapshot as the card details. Leaflet 1.9.4 and Leaflet.markercluster 1.5.3 are pinned in `public/vendor/`, with their license files; they load only after selecting Map. OpenStreetMap tiles are requested directly with normal browser caching and attribution. No API key, paid service, geocoding request, or background tile prefetch is used. Tile service availability is best-effort; List view remains available if the map cannot load. See the [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/).

Run all gallery and map tests with `node --test tests/*.test.cjs`.

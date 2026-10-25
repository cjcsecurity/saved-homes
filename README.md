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

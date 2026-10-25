#!/usr/bin/env python3
"""Export only visible home-card fields from Firefox's saved Zillow HTML pages."""
import html
import json
import re
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
EXPECTED_IDS = (
    "13558158 13535326 13535195 13535303 71717689 13555585 13554673 "
    "458103862 13496648 62810376 109168415 54487740 13556608 13556522 "
    "13654725 13654202 13649617 13652216 13652589 13661730 13662375 "
    "13668755 62717498 62719915 448138687 80393486"
).split()


def lot_label(sqft):
    if sqft < 43560:
        return f"{sqft:,} sq ft"
    acres = sqft / 43560
    return f"{acres:.2f}".rstrip("0").rstrip(".") + (" acre" if acres == 1 else " acres")


def load_exports(source):
    properties, cards = {}, {}
    for path in sorted(source.glob("saved-homes-*.html")):
        text = path.read_text()
        match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', text, re.S)
        entries = json.loads(match[1])["props"]["pageProps"]["viewer"]["savedHomes"]
        properties.update({str(e["property"]["zpid"]): e["property"] for e in entries})
        for article in re.findall(r"<article\b.*?</article>", text, re.S):
            zpid = re.search(r"/homedetails/(\d+)_zpid/", article)[1]
            plain = html.unescape(re.sub(r"<[^>]+>", " ", article))
            image = html.unescape(re.search(r'<img[^>]*src="([^"]+)"', article)[1])
            cards[zpid] = (plain, path.parent / unquote(image))
    return properties, cards


def extract(source=ROOT / "source", destination=ROOT / "public"):
    properties, cards = load_exports(source)
    if set(cards) != set(EXPECTED_IDS):
        raise ValueError(f"Expected the exact 26 visible cards; got {len(cards)}")
    homes = []
    (destination / "images").mkdir(parents=True, exist_ok=True)
    for zpid in EXPECTED_IDS:
        p = properties[zpid]
        plain, thumbnail = cards[zpid]
        for value, suffix in [(p["price"], ""), (p["bedrooms"], "bds?"),
                              (p["bathrooms"], "ba"), (p["livingArea"], "sqft")]:
            pattern = (rf"\${value:,}\b" if not suffix else rf"\b{value:,}\s+{suffix}\b")
            if not re.search(pattern, plain):
                raise ValueError(f"Visible card disagrees with serialized field for {zpid}")
        address = p["address"]
        full_address = f'{address["streetAddress"]}, {address["city"]}, {address["state"]} {address["zipcode"]}'
        if full_address not in plain:
            raise ValueError(f"Visible address disagrees for {zpid}")
        image = f"./images/{zpid}.jpg"
        image_bytes = thumbnail.read_bytes() if thumbnail.is_file() else b""
        if not image_bytes.startswith(b"\xff\xd8\xff"):
            # Firefox may save the lazy-load placeholder instead of the photo.
            url = p["photos"][0]["url"]
            if urlparse(url).hostname != "photos.zillowstatic.com":
                raise ValueError("Unexpected photo host")
            with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=30) as response:
                image_bytes = response.read()
        if not image_bytes.startswith(b"\xff\xd8\xff") or len(image_bytes) < 1000:
            raise ValueError(f"Invalid photo for {zpid}")
        (destination / image).write_bytes(image_bytes)
        attribution = p.get("attributionInfo") or {}
        homes.append({
            "id": zpid, "address": full_address, **address,
            "price": p["price"], "beds": p["bedrooms"], "baths": p["bathrooms"],
            "sqft": p["livingArea"], "lotSqft": p["lotSize"],
            "lotLabel": lot_label(p["lotSize"]), "image": image,
            "zillowUrl": f"https://www.zillow.com/homedetails/{zpid}_zpid/",
            "status": "For sale",
            "attribution": f'MLS ID #{attribution["mlsId"]}, {attribution["brokerName"]}',
        })
    result = {"updatedAt": "2026-10-25", "source": "Zillow saved homes", "total": len(homes), "homes": homes}
    (destination / "homes.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    return result


if __name__ == "__main__":
    result = extract()
    print(f'Exported {result["total"]} verified cards and thumbnails.')

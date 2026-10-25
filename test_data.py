import json
import math
import unittest
from urllib.parse import urlparse

from extract_homes import EXPECTED_IDS, ROOT, listing_coordinates, lot_label


class ListingDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "public/homes.json").read_text())

    def test_exact_visible_collection(self):
        self.assertEqual(self.data["total"], 26)
        self.assertEqual([h["id"] for h in self.data["homes"]], EXPECTED_IDS)

    def test_all_requested_fields_and_links(self):
        expected = {"id", "address", "streetAddress", "city", "state", "zipcode", "price",
                    "beds", "baths", "sqft", "lotSqft", "lotLabel", "image", "zillowUrl",
                    "status", "attribution", "latitude", "longitude"}
        for home in self.data["homes"]:
            with self.subTest(home=home["id"]):
                self.assertEqual(set(home), expected)
                for field in ("price", "beds", "baths", "sqft", "lotSqft"):
                    self.assertIsInstance(home[field], (int, float))
                    self.assertGreater(home[field], 0)
                link = urlparse(home["zillowUrl"])
                self.assertEqual(link.scheme, "https")
                self.assertEqual(link.netloc, "www.zillow.com")
                self.assertEqual(link.path, f'/homedetails/{home["id"]}_zpid/')
                image = ROOT / "public" / home["image"]
                self.assertTrue(image.is_file())
                self.assertGreater(image.stat().st_size, 1000)
                self.assertEqual(image.read_bytes()[:3], b"\xff\xd8\xff")

    def test_all_coordinates_are_finite_and_in_the_listing_region(self):
        for home in self.data["homes"]:
            with self.subTest(home=home["id"]):
                for field, limit in (("latitude", 90), ("longitude", 180)):
                    self.assertIn(type(home[field]), (int, float))
                    self.assertTrue(math.isfinite(home[field]))
                    self.assertGreaterEqual(home[field], -limit)
                    self.assertLessEqual(home[field], limit)
                # All saved cards are in the Colorado Springs / Douglas County area.
                # This also catches accidentally swapped latitude and longitude.
                self.assertTrue(38.7 < home["latitude"] < 39.5)
                self.assertTrue(-105.2 < home["longitude"] < -104.5)
        by_id = {home["id"]: home for home in self.data["homes"]}
        self.assertEqual((by_id["13558158"]["latitude"], by_id["13558158"]["longitude"]),
                         (39.00387, -104.74421))
        self.assertEqual((by_id["62810376"]["latitude"], by_id["62810376"]["longitude"]),
                         (39.333473, -105.03671))

    def test_coordinate_validation_rejects_missing_nonfinite_and_out_of_range(self):
        valid = {"zpid": "sample", "latitude": 39.00387, "longitude": -104.74421}
        self.assertEqual(listing_coordinates(valid),
                         {"latitude": 39.00387, "longitude": -104.74421})
        for field, limit in (("latitude", 90), ("longitude", 180)):
            for invalid in (None, True, "39", math.nan, math.inf, -math.inf,
                            limit + 0.01, -limit - 0.01):
                with self.subTest(field=field, value=invalid):
                    with self.assertRaises(ValueError):
                        listing_coordinates({**valid, field: invalid})
            missing = {key: value for key, value in valid.items() if key != field}
            with self.assertRaises(ValueError):
                listing_coordinates(missing)
        self.assertEqual(listing_coordinates({"latitude": 90, "longitude": -180}),
                         {"latitude": 90, "longitude": -180})

    def test_known_cards_and_lot_conversion(self):
        first = self.data["homes"][0]
        self.assertEqual((first["price"], first["beds"], first["baths"], first["sqft"]),
                         (665000, 4, 3, 2576))
        self.assertEqual(first["lotSqft"], 217800)
        self.assertEqual(lot_label(217800), "5 acres")
        self.assertEqual(lot_label(43560), "1 acre")
        self.assertEqual(lot_label(4599), "4,599 sq ft")
        self.assertEqual(lot_label(238708), "5.48 acres")


if __name__ == "__main__":
    unittest.main()

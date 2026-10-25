import json
import unittest
from urllib.parse import urlparse

from extract_homes import EXPECTED_IDS, ROOT, lot_label


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
                    "status", "attribution"}
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

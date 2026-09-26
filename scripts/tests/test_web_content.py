"""Focused checks for localized publishing and search metadata."""

import importlib.util
import json
import unittest
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET

SCRIPTS = Path(__file__).resolve().parents[1]


def load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


build = load("build_web")
sitemap = load("write_sitemap")


class Structure(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.elements = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        self.elements.append((tag, dict(attrs)))


class WebContentTests(unittest.TestCase):
    def test_duplicate_translation_is_rejected(self):
        with self.assertRaises(ValueError):
            json.loads('{"key": 1, "key": 2}', object_pairs_hook=build.unique_keys)

    def test_every_rendered_route_has_the_correct_language_and_visible_view(self):
        for language in (0, 1):
            for view, page in build.PAGES.items():
                path = build.localized_path(page["path"], language).strip("/")
                document = Structure((build.OUTPUT / path / "index.html").read_text(encoding="utf-8"))
                visible = [attrs["data-view"] for _, attrs in document.elements if "data-view" in attrs and "hidden" not in attrs]
                self.assertEqual(visible, [view])
                language_attrs = next(attrs for tag, attrs in document.elements if tag == "html")
                self.assertEqual(language_attrs["lang"], "en" if language else "pt-BR")
                robots = next(attrs["content"] for tag, attrs in document.elements if tag == "meta" and attrs.get("name") == "robots")
                self.assertEqual(robots.startswith("noindex"), view in {"dashboard", "not-found"})

    def test_roadmap_is_readable_without_javascript(self):
        document = Structure((build.OUTPUT / "en/roadmap/index.html").read_text(encoding="utf-8"))
        phases = [attrs for _, attrs in document.elements if "roadmap-phase" in attrs.get("class", "").split()]
        self.assertEqual(len(phases), 6)
        self.assertTrue(all("hidden" not in attrs for attrs in phases))

    def test_sitemap_lists_only_public_pages_with_reciprocal_languages(self):
        root = ET.fromstring(sitemap.sitemap_document("https://example.org/", build.PAGES))
        urls = root.findall(f"{{{sitemap.SITEMAP}}}url")
        self.assertEqual(len(urls), 8)
        locations = [entry.find(f"{{{sitemap.SITEMAP}}}loc").text for entry in urls]
        self.assertEqual(len(set(locations)), 8)
        self.assertFalse(any("dashboard" in url or "/404/" in url for url in locations))
        for entry in urls:
            links = entry.findall(f"{{{sitemap.XHTML}}}link")
            self.assertEqual({link.attrib["hreflang"] for link in links}, {"pt-BR", "en", "x-default"})
            self.assertTrue(all(link.attrib["href"] in locations for link in links))

    def test_invalid_origins_are_rejected(self):
        for origin in ("http://example.org", "https://name:password@example.org", "https://example.org/subpath", "https://example.org/?query=1", "https://example.org/#fragment", "https://example .org"):
            with self.subTest(origin=origin), self.assertRaises(ValueError):
                sitemap.normalize_origin(origin)


if __name__ == "__main__":
    unittest.main()

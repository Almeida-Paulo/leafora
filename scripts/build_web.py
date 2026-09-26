"""Render localized public pages with the Python standard library."""

import html
import json
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "apps" / "web-src"
OUTPUT = ROOT / "apps" / "web"
def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate content key: {key}")
        result[key] = value
    return result


MESSAGES = json.loads((SOURCE / "messages.json").read_text(encoding="utf-8"), object_pairs_hook=unique_keys)
PAGES = json.loads((SOURCE / "pages.json").read_text(encoding="utf-8"), object_pairs_hook=unique_keys)
if any(not isinstance(pair, list) or len(pair) != 2 or not all(isinstance(item, str) and item for item in pair) for pair in MESSAGES.values()):
    raise ValueError("Each message requires a non-empty Portuguese and English translation.")
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


def text(value, language):
    pair = MESSAGES.get(value)
    return pair[language] if pair else value


def localized_path(value, language):
    if not value.startswith("/") or value.startswith("//"):
        return value
    path, separator, fragment = value.partition("#")
    if path.startswith(("/assets/", "/api/", "/vendor/")):
        return value
    path = path.rstrip("/") + "/"
    return ("/en" if language else "") + path + (separator + fragment if separator else "")


class Page(HTMLParser):
    def __init__(self, language, view):
        super().__init__(convert_charrefs=True)
        self.language, self.view = language, view
        self.parts, self.stack = [], []

    def handle_decl(self, decl):
        self.parts.append("<!" + decl + ">")

    def handle_comment(self, data):
        self.parts.append("<!--" + data + "-->")

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "html":
            attrs["lang"] = "en" if self.language else "pt-BR"
        if "data-view" in attrs:
            if attrs["data-view"] == self.view:
                attrs.pop("hidden", None)
            else:
                attrs["hidden"] = None
        if self.view == "roadmap" and "roadmap-phase" in attrs.get("class", "").split():
            attrs.pop("hidden", None)
        if "data-language" in attrs:
            lang = attrs["data-language"]
            attrs["href"] = localized_path(PAGES[self.view]["path"], int(lang == "en"))
            if (lang == "en") == bool(self.language):
                attrs["aria-current"] = "true"
        elif "href" in attrs and "data-route" in attrs:
            attrs["href"] = localized_path(attrs["href"], self.language)
        for key in ("alt", "title", "aria-label", "placeholder"):
            if attrs.get(key):
                attrs[key] = text(attrs[key], self.language)
        if tag == "meta" and attrs.get("name") == "description":
            attrs["content"] = PAGES[self.view]["description"][self.language]
        if tag == "a" and attrs.get("data-nav") == self.view:
            attrs["aria-current"] = "page"
        serialized = "".join(" " + key + ("" if value is None else '="' + html.escape(value, quote=True) + '"') for key, value in attrs.items())
        self.parts.append("<" + tag + serialized + ">")
        if attrs.get("data-icon") in {"map", "wallet", "scan", "leaf"}:
            self.parts.append('<svg width="28" height="28" aria-hidden="true"><use href="/assets/icons/interface.svg#' + attrs["data-icon"] + '"></use></svg>')
        if tag not in VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag == "head":
            page = PAGES[self.view]
            for key, value in (("og:type", "website"), ("og:site_name", "Leafora"), ("og:title", page["title"][self.language]), ("og:description", page["description"][self.language]), ("og:locale", "en_US" if self.language else "pt_BR")):
                self.parts.append('<meta property="' + key + '" content="' + html.escape(value, quote=True) + '">\n')
            self.parts.append('<meta name="twitter:card" content="summary">\n')
            self.parts.append('<meta name="robots" content="' + ("noindex,follow" if self.view in {"dashboard", "not-found"} else "index,follow") + '">\n')
            if self.view == "home":
                schema = {"@context": "https://schema.org", "@type": "WebSite", "name": "Leafora", "inLanguage": "en" if self.language else "pt-BR", "description": page["description"][self.language]}
                self.parts.append('<script type="application/ld+json">' + json.dumps(schema, ensure_ascii=False).replace("<", "\\u003c") + '</script>\n')
        self.parts.append("</" + tag + ">")
        if self.stack and self.stack[-1] == tag:
            self.stack.pop()

    def handle_data(self, data):
        if self.stack and self.stack[-1] in {"script", "style"}:
            self.parts.append(data)
            return
        value = data.strip()
        if self.stack and self.stack[-1] == "title":
            translated = PAGES[self.view]["title"][self.language]
        else:
            translated = text(value, self.language)
        if not value:
            self.parts.append(data)
        else:
            prefix = data[:len(data) - len(data.lstrip())]
            suffix = data[len(data.rstrip()):]
            self.parts.append(prefix + html.escape(translated, quote=False) + suffix)


def build():
    template = (SOURCE / "site.html").read_text(encoding="utf-8")
    for language in (0, 1):
        for view, page in PAGES.items():
            parser = Page(language, view)
            parser.feed(template)
            relative = localized_path(page["path"], language).strip("/")
            destination = OUTPUT / relative / "index.html"
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text("".join(parser.parts), encoding="utf-8", newline="\n")
    data = {"messages": MESSAGES, "pages": PAGES}
    (OUTPUT / "assets/js/translations.js").write_text(
        "// Generated by scripts/build_web.py.\nexport const translations = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8", newline="\n",
    )
    print(f"Rendered {len(PAGES) * 2} localized pages.")


if __name__ == "__main__":
    build()

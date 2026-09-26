# Leafora Web

Public dApp interface served as static assets by Nginx.

## Responsibilities

- project marketplace;
- project detail pages;
- wallet connection;
- support flow;
- supporter dashboard;
- project evidence;
- Portuguese and English public content.

The public root is this directory:

```text
apps/web
```

## Rendering and Localization

Public pages are generated from `apps/web-src/site.html`, `messages.json` and
`pages.json` by `python scripts/build_web.py`, using only the Python standard
library. Generated HTML and `assets/js/translations.js` are versioned deployment
artifacts. No Node package manager, frontend server or runtime build is required.

Portuguese uses the root routes; English uses `/en/`. Each public route contains
its own initial title, description, language and visible content. JavaScript
provides wallet interactions, the API catalog and client-side navigation.
Canonical and reciprocal language links use the current origin at runtime;
the source does not contain a deployment hostname. Social titles and descriptions
are present in the HTML; the absolute preview image URL is added at runtime.
The Nginx template resolves generated page directories, uses `/en/index.html`
and `/index.html` only as project-detail fallbacks, and returns localized HTTP
404 pages for unknown static routes. Missing dynamic projects are marked
`noindex` after the catalog request; their initial response remains HTTP 200.

`python scripts/write_sitemap.py --origin https://example.org` generates the
deployment's `sitemap.xml` and `robots.txt`. These hostname-specific files are
excluded from version control. The sitemap includes the four public pages in
both languages with reciprocal language references; private portfolios and
illustrative project pages are excluded. It does not submit URLs to a search
engine or guarantee indexing.

Interface and demonstration content are translated. API-authored project text
remains in its original language and is identified as such on English pages.
No automatic translation service receives project data.

## Funding Display

Demonstration projects have explicit illustrative USD budgets, separate from
their SUI test balances. There is no implicit SUI/USD exchange rate. API records
without USD budgets show an unavailable amount, not a fabricated conversion.
Wallet confirmation, contribution tiers and transaction history retain the
actual test-token denomination. Display localization does not change contract
arguments, token quantities or signing eligibility.

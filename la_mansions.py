"""
LA large-group vacation rental finder.

Pulls VRBO listings (seeds + search results), parses bedrooms/baths/amenities/
price/reviews, estimates 4- and 5-night totals for Aug 18-23, 2026, and ranks
them by fit against a $6,000 budget.

Usage:
    pip install playwright beautifulsoup4
    python -m playwright install chromium
    python la_mansions.py

Output:
    - markdown table printed to stdout
    - la_mansions.csv written next to the script

Notes:
    - Runs a HEADED Chromium so VRBO bot-detection sees a real browser session.
    - If a page is blocked/challenged, the listing is recorded with status
      "check manually" and the script moves on. No CAPTCHA-bypass attempts.
    - Tries to pass dates via query params first (fast path); falls back to a
      base-nightly-rate estimate with ~14% tax + $400 cleaning placeholder.
"""

from __future__ import annotations

import csv
import json
import random
import re
import sys
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse

from playwright.sync_api import sync_playwright, Page, TimeoutError as PWTimeout


# ---- trip parameters --------------------------------------------------------

CHECKIN = "2026-08-18"
CHECKOUT_5N = "2026-08-23"
CHECKOUT_4N = "2026-08-22"
ADULTS = 14
BUDGET = 6000.0
TAX_RATE = 0.14
CLEANING_PLACEHOLDER = 400.0

SEEDS = [
    "https://www.vrbo.com/3918232",
    "https://www.vrbo.com/2392503",
    "https://www.vrbo.com/1213366",
]

SEARCH_URL = (
    "https://www.vrbo.com/vacation-rentals/usa/california/"
    "los-angeles-county/los-angeles?Property+Type=House"
)

OUT_CSV = Path(__file__).with_name("la_mansions.csv")


# ---- data model -------------------------------------------------------------


@dataclass
class Listing:
    url: str
    status: str = "ok"  # "ok" | "check manually"
    title: str = ""
    area: str = ""
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None
    max_guests: Optional[int] = None
    nightly_rate: Optional[float] = None  # base, pre-tax, pre-cleaning
    quoted_total_5n: Optional[float] = None  # if VRBO shows a real all-in
    quoted_total_4n: Optional[float] = None
    est_total_5n: Optional[float] = None
    est_total_4n: Optional[float] = None
    pool: bool = False
    parking: bool = False
    rating: Optional[float] = None
    review_count: Optional[int] = None
    review_flags: list[str] = field(default_factory=list)
    note: str = ""


# ---- helpers ----------------------------------------------------------------


BAD_REVIEW_PATTERNS = [
    r"\bbroken\b",
    r"\bdidn['’]t work\b",
    r"\bdoesn['’]t work\b",
    r"\bnot working\b",
    r"\bAC\b.{0,30}(broken|not work|didn['’]t work|out)",
    r"\bair conditioning\b.{0,30}(broken|not work|out)",
    r"\bno hot water\b",
    r"\bcockroach|\brodent|\bbed bug|\bmold\b",
    r"\bcancelled\b",
    r"\bfilthy|\bdirty\b",
    r"\bscam\b",
]


def pace():
    time.sleep(random.uniform(4.0, 8.0))


def with_dates(url: str, checkout: str) -> str:
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}startDate={CHECKIN}&endDate={checkout}&adults={ADULTS}"


def looks_blocked(page: Page) -> bool:
    try:
        text = page.locator("body").inner_text(timeout=3000).lower()
    except PWTimeout:
        return True
    signals = [
        "verify you are human",
        "are you a human",
        "access denied",
        "press and hold",
        "unusual traffic",
        "captcha",
        "pardon our interruption",
    ]
    return any(s in text for s in signals) or len(text) < 200


def parse_int(s: str) -> Optional[int]:
    m = re.search(r"\d+", s.replace(",", ""))
    return int(m.group()) if m else None


def parse_money(s: str) -> Optional[float]:
    m = re.search(r"\$[\s]*([\d,]+(?:\.\d+)?)", s)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None


# ---- extractors -------------------------------------------------------------


def extract_jsonld(page: Page) -> dict:
    """Pull merged JSON-LD blocks from the page. Returns {} on failure."""
    try:
        blocks = page.locator('script[type="application/ld+json"]').all_text_contents()
    except PWTimeout:
        return {}
    merged: dict = {}
    for raw in blocks:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if not isinstance(item, dict):
                continue
            for k, v in item.items():
                merged.setdefault(k, v)
    return merged


def parse_listing(page: Page, url: str) -> Listing:
    listing = Listing(url=url)

    if looks_blocked(page):
        listing.status = "check manually"
        listing.note = "page blocked or empty"
        return listing

    try:
        body_text = page.locator("body").inner_text(timeout=5000)
    except PWTimeout:
        listing.status = "check manually"
        listing.note = "body inner_text timed out"
        return listing

    # title
    try:
        listing.title = (page.locator("h1").first.inner_text(timeout=3000) or "").strip()
    except PWTimeout:
        pass
    if not listing.title:
        listing.title = (page.title() or "").strip()

    # JSON-LD for area + rating
    jsonld = extract_jsonld(page)
    addr = jsonld.get("address") or {}
    if isinstance(addr, dict):
        listing.area = addr.get("addressLocality") or addr.get("addressRegion") or ""
    agg = jsonld.get("aggregateRating") or {}
    if isinstance(agg, dict):
        try:
            listing.rating = float(agg.get("ratingValue")) if agg.get("ratingValue") else None
        except (TypeError, ValueError):
            pass
        try:
            listing.review_count = int(agg.get("reviewCount")) if agg.get("reviewCount") else None
        except (TypeError, ValueError):
            pass

    # bedrooms / bathrooms / sleeps from page text
    bd = re.search(r"(\d+)\s*bedroom", body_text, re.I)
    if bd:
        listing.bedrooms = int(bd.group(1))
    else:
        # alt: "7 suites" phrasing seen on Beverly Hills listing
        suites = re.search(r"(\d+)\s*suite", body_text, re.I)
        if suites:
            listing.bedrooms = int(suites.group(1))

    ba = re.search(r"(\d+(?:\.\d+)?)\s*bath", body_text, re.I)
    if ba:
        try:
            listing.bathrooms = float(ba.group(1))
        except ValueError:
            pass

    sl = re.search(r"sleeps\s*(\d+)", body_text, re.I)
    if sl:
        listing.max_guests = int(sl.group(1))
    else:
        gm = re.search(r"(\d+)\s*guests?", body_text, re.I)
        if gm:
            listing.max_guests = int(gm.group(1))

    # amenities
    lower = body_text.lower()
    listing.pool = bool(re.search(r"\b(private pool|swimming pool|heated pool|pool\b)", lower))
    listing.parking = bool(
        re.search(r"\b(free parking|parking on premises|garage|driveway parking|parking\b)", lower)
    )

    # nightly rate (base)
    nm = re.search(r"\$[\s]*([\d,]+)\s*(?:/|per)\s*night", body_text, re.I)
    if nm:
        try:
            listing.nightly_rate = float(nm.group(1).replace(",", ""))
        except ValueError:
            pass

    # bad review keywords in visible text (rough — VRBO lazy-loads reviews,
    # but anything visible counts as a signal)
    for pat in BAD_REVIEW_PATTERNS:
        if re.search(pat, body_text, re.I):
            listing.review_flags.append(pat.strip("\\b").replace("\\", ""))

    return listing


def try_quoted_total(page: Page) -> Optional[float]:
    """
    After loading a listing with date params, VRBO often renders an all-in
    'Total $X' figure in the price-summary side panel. Try several selectors
    and fall back to scanning body text.
    """
    candidates = [
        "text=/Total\\s*\\$[\\d,]+/",
        "[data-stid='content-price-summary']",
        "[data-testid='price-summary-total']",
    ]
    for sel in candidates:
        try:
            txt = page.locator(sel).first.inner_text(timeout=2500)
        except PWTimeout:
            continue
        m = re.search(r"Total[^\$]*\$[\s]*([\d,]+(?:\.\d+)?)", txt, re.I)
        if m:
            return float(m.group(1).replace(",", ""))
    # body-wide fallback
    try:
        body = page.locator("body").inner_text(timeout=2000)
    except PWTimeout:
        return None
    m = re.search(r"Total[^\$\n]{0,40}\$[\s]*([\d,]+(?:\.\d+)?)", body, re.I)
    if m:
        try:
            return float(m.group(1).replace(",", ""))
        except ValueError:
            return None
    return None


def fetch_listing(page: Page, url: str) -> Listing:
    """Load a listing with 5-night dates, then a quick 4-night pass."""
    # 5-night pass
    try:
        page.goto(with_dates(url, CHECKOUT_5N), wait_until="domcontentloaded", timeout=45000)
    except PWTimeout:
        return Listing(url=url, status="check manually", note="navigation timeout")

    # let date-dependent content settle
    try:
        page.wait_for_load_state("networkidle", timeout=12000)
    except PWTimeout:
        pass

    listing = parse_listing(page, url)
    if listing.status != "ok":
        return listing

    listing.quoted_total_5n = try_quoted_total(page)

    # 4-night pass (only if we got a quoted 5-night; otherwise estimate suffices)
    if listing.quoted_total_5n is not None:
        pace()
        try:
            page.goto(with_dates(url, CHECKOUT_4N), wait_until="domcontentloaded", timeout=45000)
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except PWTimeout:
                pass
            if not looks_blocked(page):
                listing.quoted_total_4n = try_quoted_total(page)
        except PWTimeout:
            pass

    # estimate (always compute as a backstop)
    if listing.nightly_rate:
        listing.est_total_5n = round(
            (listing.nightly_rate * 5 + CLEANING_PLACEHOLDER) * (1 + TAX_RATE), 2
        )
        listing.est_total_4n = round(
            (listing.nightly_rate * 4 + CLEANING_PLACEHOLDER) * (1 + TAX_RATE), 2
        )

    return listing


# ---- search discovery -------------------------------------------------------


def discover_from_search(page: Page, limit: int = 20) -> list[str]:
    """Scroll the VRBO search results and collect listing URLs."""
    try:
        page.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=45000)
    except PWTimeout:
        print("search page navigation timed out", file=sys.stderr)
        return []

    try:
        page.wait_for_load_state("networkidle", timeout=12000)
    except PWTimeout:
        pass

    if looks_blocked(page):
        print(
            "search page blocked — skipping discovery. URL to check manually:\n  "
            + SEARCH_URL,
            file=sys.stderr,
        )
        return []

    found: list[str] = []
    seen: set[str] = set()
    for _ in range(8):
        try:
            hrefs = page.eval_on_selector_all(
                "a[href]", "els => els.map(e => e.getAttribute('href'))"
            )
        except PWTimeout:
            hrefs = []
        for href in hrefs:
            if not href:
                continue
            full = urljoin("https://www.vrbo.com", href)
            # VRBO listing URLs look like /<numeric_id>[/...] or
            # /vacation-rental/p<numeric_id>
            host = urlparse(full).netloc
            path = urlparse(full).path
            if "vrbo.com" not in host:
                continue
            m = re.match(r"^/(\d{5,9})(?:/|$)", path) or re.match(
                r"^/vacation-rental/p(\d{5,9})", path
            )
            if not m:
                continue
            canonical = f"https://www.vrbo.com/{m.group(1)}"
            if canonical in seen:
                continue
            seen.add(canonical)
            found.append(canonical)
            if len(found) >= limit:
                return found
        page.mouse.wheel(0, 4000)
        time.sleep(random.uniform(1.5, 3.0))
    return found


# ---- ranking + output -------------------------------------------------------


def best_total_5n(l: Listing) -> Optional[float]:
    return l.quoted_total_5n if l.quoted_total_5n is not None else l.est_total_5n


def under_budget(l: Listing) -> bool:
    t = best_total_5n(l)
    return t is not None and t <= BUDGET


def rank_key(l: Listing):
    # under-budget first, then more beds, then pool+parking, then rating
    return (
        0 if under_budget(l) else 1,
        -(l.bedrooms or 0),
        -((1 if l.pool else 0) + (1 if l.parking else 0)),
        -(l.rating or 0.0),
    )


def filter_and_rank(listings: list[Listing]) -> list[Listing]:
    # keep 7+ bedrooms OR unknown-but-not-blocked seeds (they were user-picked)
    kept = []
    for l in listings:
        if l.status == "check manually":
            kept.append(l)
            continue
        if l.bedrooms is None or l.bedrooms >= 7:
            kept.append(l)
    kept.sort(key=rank_key)
    return kept


def render_markdown(listings: list[Listing]) -> str:
    rows = [
        "| # | Name | Beds/Baths | Area | Est. 5-night | Pool / Parking | Reviews | Link |",
        "|---|------|------------|------|--------------|----------------|---------|------|",
    ]
    for i, l in enumerate(listings, start=1):
        if l.status == "check manually":
            rows.append(
                f"| {i} | _check manually_ | — | — | — | — | — | [{l.url}]({l.url}) |"
            )
            continue
        beds = l.bedrooms if l.bedrooms is not None else "?"
        baths = l.bathrooms if l.bathrooms is not None else "?"
        total = best_total_5n(l)
        if l.quoted_total_5n is not None:
            total_str = f"${l.quoted_total_5n:,.0f} (quoted)"
        elif l.est_total_5n is not None:
            total_str = f"~${l.est_total_5n:,.0f} (est)"
        else:
            total_str = "price on inquiry"
        if total is not None and total > BUDGET:
            total_str += " ⚠ over budget"
        pp = f"{'✓' if l.pool else '✗'} / {'✓' if l.parking else '✗'}"
        if l.rating is not None:
            rev = f"{l.rating}★"
            if l.review_count:
                rev += f" ({l.review_count})"
        else:
            rev = "—"
        if l.review_flags:
            rev += " ⚠ " + ", ".join(sorted(set(l.review_flags))[:3])
        name = (l.title or "—")[:60]
        rows.append(
            f"| {i} | {name} | {beds}bd/{baths}ba | {l.area or '—'} | "
            f"{total_str} | {pp} | {rev} | [link]({l.url}) |"
        )
    return "\n".join(rows)


def write_csv(listings: list[Listing], path: Path) -> None:
    if not listings:
        return
    fields = list(asdict(listings[0]).keys())
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=fields)
        w.writeheader()
        for l in listings:
            row = asdict(l)
            row["review_flags"] = "; ".join(row["review_flags"])
            w.writerow(row)


# ---- main -------------------------------------------------------------------


def main() -> int:
    listings: list[Listing] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1366, "height": 900},
            locale="en-US",
        )
        page = ctx.new_page()

        # 1. seeds
        urls: list[str] = list(SEEDS)

        # 2. discovery (best-effort)
        print("discovering listings from VRBO search...", file=sys.stderr)
        try:
            discovered = discover_from_search(page, limit=15)
        except Exception as e:  # noqa: BLE001
            print(f"discovery error: {e}", file=sys.stderr)
            discovered = []
        for u in discovered:
            if u not in urls:
                urls.append(u)
        print(f"  -> {len(urls)} total URLs to scrape", file=sys.stderr)

        # 3. scrape each
        for u in urls:
            pace()
            print(f"scraping {u}", file=sys.stderr)
            try:
                listings.append(fetch_listing(page, u))
            except Exception as e:  # noqa: BLE001
                print(f"  error on {u}: {e}", file=sys.stderr)
                listings.append(
                    Listing(url=u, status="check manually", note=f"error: {e}")
                )

        browser.close()

    ranked = filter_and_rank(listings)
    md = render_markdown(ranked)
    print()
    print(md)
    print()

    write_csv(ranked, OUT_CSV)
    print(f"wrote {len(ranked)} rows to {OUT_CSV}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

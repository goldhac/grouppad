# GroupPad — working notes

Group trip planning: one board where a group compares rentals, votes, asks Scout,
and locks one official pick. React/Vite client + an Express `server.js`, JSON
files per trip on a Railway volume plus SQLite for the scraped pipeline. Live at
**grouppad.goldhac.com**.

---

## Working principle: undone work becomes a GitHub issue

**If we identify work and don't do it, it gets filed as an issue before the
session ends.** Not a TODO comment, not a line in a doc, not "we should
probably" in chat — those all evaporate.

```bash
gh issue create --title "…" --label "…" --body "…"
```

`goldhac/grouppad`, issues enabled. Labels: `sources`, `design`, `tier-2`,
`scout`, `blocked`, plus the defaults.

This applies to:
- a feature deliberately deferred ("mobile is Phase 2")
- something blocked on an external party (a key, an approval)
- a bug found in passing that isn't in scope
- a known gap in something being shipped

**The repo is PUBLIC.** No API keys, no member emails, no user data in issue
bodies. Write them so someone with no memory of the conversation can act.

Write the *why*, not just the what — an issue that says "add food stops" is
worth much less than one that says why suggestions are OSM-only and what rule
must survive the change.

---

## Specs are the source of truth — read before changing a feature

| File | What it governs |
|---|---|
| `docs/specs/scout.md` | **Read before adding ANY AI surface.** Five Scout jobs and the hard lines between them. |
| `docs/specs/experiences.md` | The "To do" tab end to end: sources, the routed day, the plan studio, the share page. |
| `docs/AUDIT.md` | The 2026-08-06 site audit. Tier 0 + 1 shipped; tier 2 is open as issues. |
| `docs/specs/handoffs/` | Design handoffs, kept verbatim. |
| `docs/emails/` | Transactional + announcement email, and `CHANGES.md`. |

---

## Rules that keep getting rediscovered the hard way

**Scout never invents an entity.** It ranks, compares, explains and orders
things we already hold. It does not produce a venue name, a price, an opening
time or a fact about a real business. Every job needs a non-AI fallback, a
`geminiGuard()` cap, and a content-hash cache. Output is always attributed as
"Scout", never passed off as a provider's own copy.

**Never `book`.** Every outbound exit is *Open on <source>*. This product does
not transact.

**Gaps get named, not filled.** A plan that admits "nothing after 4:10p" is
worth more than one that invents something to look complete.

**A blocked scrape must not blow away a good list.** Empty results keep the
previous rows (GP-A4); the experiences runner also carries forward any row the
group has voted on, saved or pinned.

**`.tab-panel` animates a `transform`**, which makes it the containing block for
`position: fixed` descendants. Any overlay inside it must be rendered through a
Radix portal or you get a dark scrim and no dialog.

**Ids are namespaced** — `airbnb:123`, `osm:node/456`, `viator:ABC`. They key
five separate stores; a bare provider id collides across sources.

---

## Environment gotchas

- `.railwayignore` excludes `docs/` except `docs/emails/`, which the announcement
  sender reads at runtime. Written as `docs/*` + `!docs/emails/` because
  gitignore syntax cannot re-include under an excluded parent.
- `index.html` is read **once at boot** to inject `window.__PUBLIC_CONFIG__`, so
  a client rebuild needs a server restart to be served.
- Production data lives on the volume at `/data` (`PIPELINE_DATA_DIR`), not in
  the image. `railway ssh` is how you inspect or run anything against it.
- `loadListings()` returns `{ trip, listings }` — **not** an array.

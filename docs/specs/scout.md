# Scout — demarcation plan

**Status:** Living doc · Created 2026-08-11 (before Experiences Phase 3).
**Read this before adding ANY AI surface.** Scout is one character with several
jobs; without clear lines it turns into "an AI button on every panel," which is
both expensive and confusing. This file defines the boundaries.

## 1. What Scout is

One persona: *the friend who's good at deciding.* It never books, never pays,
never messages anyone. It reads what the group has already produced (homes,
votes, itinerary, caveats, experiences) and gives an opinion with a reason.

**Scout is opinionated, not authoritative.** Every Scout output is a suggestion
the group can ignore; the organizer still locks the decision. Scout never
mutates group state on its own — a human presses the button that saves.

## 2. The four jobs (and the lines between them)

| Job | Endpoint | Scope | Cached? | Shared? | Trigger |
|-----|----------|-------|---------|---------|---------|
| **Rank** | `POST .../ai-rank` | Homes | ✅ by content hash | ✅ group-wide | Automatic on board load (debounced) |
| **Compare** | `POST .../compare-listings` | Homes (2+ selected) | ❌ | ✅ result shown to actor | Explicit click |
| **Ask** | `POST .../ask-scout` | Homes (personal Q) | ❌ | ❌ **private to asker** | Explicit ask |
| **Plan** | `POST .../plan-experiences` | Experiences | ✅ by votes hash | ✅ group-wide | Explicit click (organizer) |

**The rules that keep these apart:**
- **Rank is ambient, Plan is deliberate.** Ranking homes happens on its own because
  the board is useless unsorted. Planning days costs money and implies intent, so a
  human asks for it. Never make Plan automatic.
- **Ask is the private lane.** Anything personal ("is this good for my parents?")
  goes through Ask, is never cached, and never written to shared state. If a
  feature needs to be seen by the group, it does NOT belong in Ask.
- **One Scout call per user action.** No chaining (Plan must not internally call
  Rank). If a job needs another job's output, it reads the *cached* result.
- **Homes and Experiences never share a ranking call.** They have different
  candidate shapes, prompts, and stakes. Cross-pollination happens only through
  explicit, cheap signals (see §5), never by merging the candidate lists.

## 3. Cost & safety boundaries (non-negotiable)

- Every Scout endpoint sits behind `geminiGuard()` (monthly cap) + `rateLimit` +
  `requireTripMember`. A non-member can never trigger spend.
- **Every job has a non-AI fallback.** Rank → `heuristicRankOrder`. Plan →
  vote-order grouping (no AI). Compare/Ask → an honest error. If Gemini is down,
  capped, or unconfigured, the product still works, just less clever.
- Cached jobs are keyed by a **content hash** so identical state never re-spends.
- `bumpUsage('gemini', …)` on every call — the admin spend meter is the source of truth.
- Prompts send **compact keyed candidates** (`c0`, `c1`…), never raw 19-digit ids
  (JSON number precision loss) and never PII (no emails, no member names).

## 4. UI demarcation (where each job may appear)

| Surface | May host | Must NOT host |
|---------|----------|---------------|
| Homes grid / cards | Rank ("why" line) | Plan, Ask |
| Shortlist / Compare modal | Compare | Rank re-runs |
| Board header "Ask Scout" | Ask (personal) | Anything group-mutating |
| Things-to-do tab | **Plan** (day-list) | Home ranking, Compare |
| Trip plan (itinerary) | Plan's *output*, written by a human click | Live AI text |

**Naming:** the button is always "Ask Scout" (personal) or "Scout: <verb>"
(group). Never "AI", never "Generate" alone — the persona carries the trust.
Scout output is always visually attributed (sparkle icon + "Scout" label) so a
member can tell a machine opinion from a group decision.

## 5. Homes ↔ Experiences boundary

Allowed cross-signals (cheap, non-AI):
- Distance from the decided home → experience cards (Phase 2, shipped).
- Experience density near a home → a **heuristic** badge/signal for home ranking
  (Phase 3.4). Computed in code, NOT by asking Gemini to weigh experiences while
  ranking homes.

Forbidden: one prompt that ranks homes *and* plans days. Separate jobs, separate
caches, separate failure modes.

## 6. Adding a new Scout job — checklist

1. Does it fit an existing job? (Most "new AI ideas" are an Ask prompt.)
2. Group-shared or personal? → decides cache + storage.
3. What's the non-AI fallback?
4. What's the content hash key?
5. Which single UI surface owns it (§4)?
6. Guard chain: `requireTripMember` + `rateLimit` + `geminiGuard` + `bumpUsage`.
7. Add a row to §2's table in this file.

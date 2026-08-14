# Corrections applied before this email can be sent

The handoff email announced behaviour the product deliberately does **not** have.
Fixed here so the announcement matches what ships. Original preserved in git.

| # | Was | Now | Why |
|---|---|---|---|
| 1 | `Coffee at République` tagged **Scout added** | `The house · everyone out the door`, and a real **`Grand Park` / On the way** row | **Scout never invents a stop.** Fabricating a coffee shop recommends a real business nobody verified — that rule has held since the routed day was designed. What the product actually offers is real, *mapped* places (OSM) that sit on the route, tagged optional and excluded from the totals. |
| 2 | "Scout labels **what it invented**" | "Scout **never invents a stop** — the only extras are real, mapped places that genuinely sit on your route" | Same reason. The old copy advertised the exact thing we chose not to build. |
| 3 | Preheader: "drive times, **coffee stops, sunset timing** and all" | "the drives in between, what's worth a detour, and where the day still has a hole" | Neither claim is true. |
| 4 | Whys: "a morning session, while it's cool", "lands as lunch" | "cheap, close, and easy to bail out of", "the group's strongest pick" | The Plan prompt **forbids time-of-day claims** — the server computes the clock, so a model-written time reference can contradict the schedule printed next to it. |
| 5 | Day ended at the last activity | Starts *and* ends at the house | Days now return home; the last drive of the night is in the totals. |
| 6 | `1 hr 9 min` driving · `$176` pp | `1 hr 25 min` · `$170` pp | Recomputed: 35 + 20 + 30 home; $60 + $75 + $35, with the optional stop excluded. |
| 7 | `grouppad.app/#/…` (×3) | `grouppad.goldhac.com/#/…` | The real production domain. |
| 8 | Coffee thumbnail beside "The house" | House photo | Leftover from the row it replaced. |

## Still to do before sending (from the handoff README, unchanged)
1. **Replace all 7 Unsplash hotlinks** with self-hosted images — bulk mail hotlinking is unreliable.
2. Confirm the ESP resolves `assets/logo-2x.png`.
3. Wire `#/unsubscribe` to the real list-unsubscribe header.
4. Swap "Hi there," for a first-name merge tag.
5. Test Gmail / Apple Mail / Outlook, and re-check dark-mode contrast (any `color:#134E4A` needs `class="ec-ink"`).

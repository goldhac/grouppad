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

## Made send-ready

* **All 7 images are self-hosted.** Downloaded to `public/email/` and referenced
  absolutely at `grouppad.goldhac.com/email/…`. Hotlinking Unsplash in bulk mail
  is unreliable, and relative `assets/` paths only work if the ESP rewrites them.
  Swapping the art is now replacing a file — no HTML edit. Same for the logo.
* **Unsubscribe is real.** `{{unsubscribe}}` is filled per recipient with that
  user's existing stable token, hitting the `/api/notify/unsubscribe` endpoint
  that already exists — one click turns off *all* GroupPad mail, not just this.
* **`List-Unsubscribe` + `List-Unsubscribe-Post` headers**, so Gmail and Apple
  Mail render their native unsubscribe control. Without them a bulk send from a
  young domain is a spam-folder bet, and it's legally required across most of
  this list.
* The README's "swap 'Hi there,' for a first-name token" is **stale** — this
  version has no greeting; it opens on "You were here before it worked."

## Sending

```
node scripts/send-announcement.js                        # dry run (the default)
node scripts/send-announcement.js --only you@your.com    # one real test send
node scripts/send-announcement.js --send                 # the real thing
```

Dry run is the default deliberately: there is no unsend. Anyone who has already
unsubscribed is skipped — an announcement is not a loophole around their opt-out.
The script refuses to run if any merge token is left unresolved.

## Still worth doing
1. The images are still generic Unsplash stock. Real experience photos would be
   better — drop them into `public/email/` under the same filenames.
2. Send `--only` to yourself first and read it in Gmail, Apple Mail and Outlook.
3. Re-check dark mode: any `color:#134E4A` needs `class="ec-ink"` or it stays
   dark teal on a dark card.

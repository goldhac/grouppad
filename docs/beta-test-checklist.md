# GroupPad — Beta Test Checklist 🧪

**App:** https://exquisite-inspiration-production-7511.up.railway.app
*(soon: https://grouppad.goldhac.com)*

**How to use this:** Give each tester a copy (paste into Google Sheets / Notion so they can tick boxes). Ask them to try each item, mark **✅ Pass** or **❌ Fail**, and drop a note on anything confusing or broken. Have them note their **device + browser** (e.g. "iPhone Safari", "Windows Chrome") at the top — most issues are device-specific.

**Device key:** 📱 = phone · 💻 = computer · 🔁 = try on both

---

## 1 · Getting in

| # | Feature | What to do | Expected result | Device | ✅/❌ | Notes |
|---|---------|-----------|-----------------|--------|------|-------|
| 1.1 | Open a shared link | Open the trip link someone sent you | The board loads; you see homes even before signing in | 🔁 | | |
| 1.2 | Guest prompt | Look at the top of the board while signed out | You see a **"Sign in to join"** button + a guest banner | 🔁 | | |
| 1.3 | Sign in (email) | Tap **Sign in** → enter your email → check inbox → tap the link | You're signed in and land back on the board | 🔁 | | |
| 1.4 | Invite recognition | After signing in from an invite link | You're **auto-joined**; the trip now shows on your trips dashboard (not empty) | 🔁 | | |
| 1.5 | Sign in (Google) | Tap **Sign in** → Continue with Google | Signs you in without a password | 🔁 | | |
| 1.6 | Stay signed in | Close the tab, reopen the link | It still recognizes you (no re-login) | 🔁 | | |

## 2 · The board & recommendations

| # | Feature | What to do | Expected result | Device | ✅/❌ | Notes |
|---|---------|-----------|-----------------|--------|------|-------|
| 2.1 | Recommended list | Look at **Recommended** | Top 10 homes, **all within budget**, ranked by Scout | 🔁 | | |
| 2.2 | "Why" line | Read under each recommended home | A one-line reason it ranks there (budget/distance/amenities) | 🔁 | | |
| 2.3 | No junk | Scan the recommended homes | No obviously over-budget or "no price" test homes | 🔁 | | |
| 2.4 | Sections | Scroll the board | "From your group" (community) and "More homes" (live) sections show below | 🔁 | | |
| 2.5 | No duplicates | Look across all sections | The same home doesn't appear twice | 🔁 | | |
| 2.6 | Per-person price | Look at any home | Shows total **and** per-person cost | 🔁 | | |

## 3 · Adding homes

| # | Feature | What to do | Expected result | Device | ✅/❌ | Notes |
|---|---------|-----------|-----------------|--------|------|-------|
| 3.1 | Add a link | Tap **Add (+)** → paste an Airbnb/VRBO/villa link → submit | The home appears under "From your group" with photos + price | 🔁 | | |
| 3.2 | Manual price | Add a link that has no public price, enter a price | Your price is used as the estimate | 🔁 | | |
| 3.3 | Bad link | Paste a non-rental URL | A friendly error, no crash | 🔁 | | |

## 4 · Voting & shortlist

| # | Feature | What to do | Expected result | Device | ✅/❌ | Notes |
|---|---------|-----------|-----------------|--------|------|-------|
| 4.1 | Vote | Thumbs-up a home | Vote registers; counts update | 🔁 | | |
| 4.2 | Rises to shortlist | Vote a home to net +1 | It moves into the **Shortlist** tab | 🔁 | | |
| 4.3 | Save (private) | Tap the bookmark on a home | It appears in **Saved**; only you see it | 🔁 | | |
| 4.4 | Top choice | Tap the **star** on a home | It's marked as your top choice | 🔁 | | |

## 5 · Compare with Scout (AI)

| # | Feature | What to do | Expected result | Device | ✅/❌ | Notes |
|---|---------|-----------|-----------------|--------|------|-------|
| 5.1 | Ask Scout (shortlist) | In Shortlist, tap **Ask Scout** | A result appears comparing your shortlist | 🔁 | | |
| 5.2 | Compare selected | Tick 2+ homes → **Compare** | Side-by-side comparison + Scout's verdict | 🔁 | | |
| 5.3 | Rank my saved | In **Saved**, tap "Rank my saved by Scout" | A result modal shows (this previously did nothing) | 📱 | | |
| 5.4 | Head-to-head badge | Compare exactly 2 homes | "VS" badge sits **centered between** the two cards | 📱 | | |

## 6 · The decision / top pick

| # | Feature | What to do | Expected result | Device | ✅/❌ | Notes |
|---|---------|-----------|-----------------|--------|------|-------|
| 6.1 | Leaderboard | Open the **Decision** tab | Live leaderboard + "X of N voted" | 🔁 | | |
| 6.2 | Lock the pick (organizer) | As organizer, make a home official | It gets the gold seal | 💻 | | |
| 6.3 | Pick leaves shortlist | After locking | The official pick **disappears** from Shortlist/Recommended | 🔁 | | |

## 7 · Home details

| # | Feature | What to do | Expected result | Device | ✅/❌ | Notes |
|---|---------|-----------|-----------------|--------|------|-------|
| 7.1 | Open detail | Tap any home | A detail view opens with photos, facts, price | 🔁 | | |
| 7.2 | Quick facts | Look at the detail | Beds/baths/sleeps/rating/per-person grid | 📱 | | |
| 7.3 | Map widget | Scroll the detail | A map + drive-time chips + "Open in Maps" | 🔁 | | |
| 7.4 | Reviews | On a home with reviews | Guest review snippets show | 🔁 | | |
| 7.5 | AI walkthrough | Generate the AI video walkthrough (if available) | A short narrated tour generates | 💻 | | |

## 8 · Filters

| # | Feature | What to do | Expected result | Device | ✅/❌ | Notes |
|---|---------|-----------|-----------------|--------|------|-------|
| 8.1 | Open filters | Tap **Filters** | Sheet with under-budget, pool, parking, hot tub, sleeps, split | 🔁 | | |
| 8.2 | Apply a filter | Turn on "Pool" | List narrows; an active chip shows next to Filters | 🔁 | | |
| 8.3 | Filters persist | Apply a filter, refresh the page | The filter is still on | 🔁 | | |
| 8.4 | Reset on sign-out | Sign out and back in | Filters reset to default | 🔁 | | |

## 9 · Itinerary & must-haves

| # | Feature | What to do | Expected result | Device | ✅/❌ | Notes |
|---|---------|-----------|-----------------|--------|------|-------|
| 9.1 | Itinerary card | Open **Discussion** (the itinerary card) | A map-style card with a teaser | 🔁 | | |
| 9.2 | Full itinerary | Tap the itinerary card | A popup with the full plan | 🔁 | | |
| 9.3 | Post a must-have | Add a must-have/dealbreaker | It posts; organizer can approve it | 🔁 | | |

## 10 · The guide / how-it-works

| # | Feature | What to do | Expected result | Device | ✅/❌ | Notes |
|---|---------|-----------|-----------------|--------|------|-------|
| 10.1 | Replay the tour | Tap "Show me around" (Discussion/Chat) | The 8-step walkthrough opens | 📱 | | |
| 10.2 | Covers everything | Read the steps | Explains sections, Scout ranking, vote, compare, AI walkthrough, top pick | 🔁 | | |
| 10.3 | Help page | Open **How it works** | Illustrated steps + "Every feature" + FAQ | 🔁 | | |

## 11 · Look & feel

| # | Feature | What to do | Expected result | Device | ✅/❌ | Notes |
|---|---------|-----------|-----------------|--------|------|-------|
| 11.1 | Dark mode default | Open the app fresh | It's **dark** by default | 🔁 | | |
| 11.2 | Toggle theme | Tap the sun/moon icon | Switches light/dark and remembers it | 🔁 | | |
| 11.3 | **Scroll (important!)** | On the board, scroll up and down | Scrolls smoothly — **especially test iPhone Safari + Mac Safari** | 🔁 | | |
| 11.4 | Filter row | Look at the filter row on mobile | Clean — just "Filters" + any active chips (not a cut-off list) | 📱 | | |
| 11.5 | Rotate / resize | Rotate the phone / resize the window | Layout adapts, nothing overlaps or clips | 🔁 | | |

## 12 · Edge cases

| # | Feature | What to do | Expected result | Device | ✅/❌ | Notes |
|---|---------|-----------|-----------------|--------|------|-------|
| 12.1 | Link preview | Paste the app link in iMessage/WhatsApp/Slack | A GroupPad preview card shows | 📱 | | |
| 12.2 | Offline-ish | Open on a slow connection | Loads gracefully, no blank screen | 🔁 | | |
| 12.3 | Back button | Use the browser back button around the app | Goes where expected, no dead-ends | 🔁 | | |

---

### Tester sign-off

- **Name / device / browser:** ______________________
- **Overall feel (1–5):** ____
- **Biggest issue:** ______________________
- **What confused you most:** ______________________
- **Would you use this to plan a real trip? (Y/N + why):** ______________________

> Please flag anything labeled **❌**, plus a screenshot if you can. Priority feedback: anything in **§1 (Getting in)** and **§11.3 (Scroll)**.

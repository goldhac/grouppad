const CARDS: { title: string; body: React.ReactNode }[] = [
  {
    title: '👍 Like vs ⭐ Top choice vs ✅ Official pick',
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>👍 / 👎 Like</strong> — your quick read on a home. Any home with net likes ≥ 1
          rises into the <strong>Shortlist</strong>. Like as many as you want.
        </li>
        <li>
          <strong>⭐ Top choice</strong> — your <em>single</em> favorite. Everyone gets one. The
          tally shows the group's leaderboard (your individual pick stays private — only totals
          show).
        </li>
        <li>
          <strong>✅ Official pick</strong> — the organizer locks the final decision. It pins a
          banner to the top so everyone knows what we're booking.
        </li>
      </ul>
    ),
  },
  {
    title: '🏠 Browsing & details',
    body: (
      <p>
        Tap any card to open the full detail view: bigger gallery, all amenities, the price broken
        down, your per-person share, and a map of the area. Use the filters up top (under budget,
        pool, parking) to narrow the list, and the split slider to see cost per person for any
        headcount.
      </p>
    ),
  },
  {
    title: '➕ Add a listing',
    body: (
      <p>
        Found one we missed? Paste any VRBO / Airbnb / Booking.com URL into{' '}
        <strong>"+ Add a listing."</strong> We fetch the details and price for the trip dates
        automatically. It shows under <strong>Community Submissions</strong> until it earns a like.
      </p>
    ),
  },
  {
    title: '🤖 AI compare & 💬 caveats',
    body: (
      <p>
        From the shortlist, hit <strong>Compare with AI</strong> for a side-by-side weighing against
        the itinerary and budget — or tick the "compare" box on two cards for a 1v1. Drop must-haves
        and dealbreakers in <strong>Group caveats</strong>; they feed the AI ranking.
      </p>
    ),
  },
  {
    title: '🔐 Signing in',
    body: (
      <p>
        Sign in with Google (or an email magic-link) so your votes and picks are tied to you across
        devices. You can browse without signing in, but you'll need an account to vote, add homes,
        or post caveats.
      </p>
    ),
  },
];

export function HelpView() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <h2 className="text-2xl font-bold">How GroupPad works</h2>
      <div className="mt-6 space-y-4">
        {CARDS.map((c) => (
          <div key={c.title} className="rounded-lg border border-border bg-panel p-5">
            <h3 className="text-base font-semibold">{c.title}</h3>
            <div className="mt-2 text-sm leading-relaxed text-muted">{c.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

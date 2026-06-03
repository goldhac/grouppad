import { Link, useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';

const STEPS = [
  {
    n: 1,
    title: 'Browse & like',
    body: "Skim every 7+ bedroom home, open one for full photos, price breakdown & map. 👍 the ones you'd stay in.",
  },
  {
    n: 2,
    title: 'Shortlist & compare',
    body: 'Liked homes rise into a shared shortlist. Tap 🤖 to let AI weigh them against the itinerary & budget.',
  },
  {
    n: 3,
    title: 'Pick the winner',
    body: 'Everyone casts one ⭐ top choice. The organizer locks the ✅ official pick when the group converges.',
  },
];

export function WelcomeView() {
  const { trip, listings, openAuth, startOnboarding } = useApp();
  const navigate = useNavigate();

  const tripLine = trip
    ? `${trip.checkin} → ${trip.checkout_5n} · ${trip.adults} guests · $${trip.budget.toLocaleString()} all-in budget · ${listings.length} homes to browse`
    : 'Loading the trip…';

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-8">
      <section className="flex flex-col items-center gap-5 text-center">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          Pick the LA house for 14 — together.
        </h2>
        <p className="text-sm text-muted">{tripLine}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              window.location.href = api.googleSignInUrl;
            }}
          >
            Sign in with Google
          </Button>
          <Button variant="ghost" size="lg" onClick={() => openAuth()}>
            or use email
          </Button>
        </div>
        <button className="text-sm text-link hover:underline" onClick={() => navigate('/board')}>
          Just browse the listings →
        </button>
        <button
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"
          onClick={() => startOnboarding(true)}
        >
          <Play className="h-3.5 w-3.5" /> Take the 30-second tour
        </button>
      </section>

      <section className="mt-14 grid gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-lg border border-border bg-panel p-5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
              {s.n}
            </span>
            <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </section>

      <p className="mt-10 text-center text-sm text-muted">
        Already know the drill?{' '}
        <Link to="/board" className="text-link hover:underline">
          Go to the board →
        </Link>
      </p>
    </div>
  );
}

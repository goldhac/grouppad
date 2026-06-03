import { useNavigate } from 'react-router-dom';
import { ThumbsUp, Sparkles, Trophy, Plus, Play } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';

const STEPS = [
  { icon: ThumbsUp, title: 'Browse & like', body: 'Drop in the rentals you\'re eyeing. Everyone skims, opens the details, and 👍 the ones they\'d actually stay in.' },
  { icon: Sparkles, title: 'Shortlist & compare', body: 'Liked homes rise into a shared shortlist. Let AI weigh them against your plans and budget — or run a 1v1.' },
  { icon: Trophy, title: 'Pick the winner', body: 'Everyone casts one ⭐ top choice. The organizer locks the ✅ official pick when the group converges.' },
];

export function LandingView() {
  const { user, openAuth, startOnboarding } = useApp();
  const navigate = useNavigate();

  const primary = () => {
    if (user) navigate('/trips/new');
    else window.location.href = api.googleSignInUrl;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* Hero */}
      <section className="flex flex-col items-center gap-5 py-16 text-center sm:py-24">
        <span className="rounded-full border border-border bg-panel px-3 py-1 text-xs text-muted">
          Group trips, minus the endless chat
        </span>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Pick the place your whole group actually agrees on.
        </h1>
        <p className="max-w-xl text-base text-muted sm:text-lg">
          GroupPad turns "where should we stay?" into one shared board: add rentals, vote, compare
          with AI, and lock the winner together.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" size="lg" onClick={primary}>
            <Plus className="h-4 w-4" /> {user ? 'Start a trip' : 'Get started — it\'s free'}
          </Button>
          {!user && (
            <Button variant="ghost" size="lg" onClick={() => openAuth()}>
              Sign in
            </Button>
          )}
          <Button variant="ghost" size="lg" onClick={() => startOnboarding(true)}>
            <Play className="h-4 w-4" /> 30-second tour
          </Button>
        </div>
      </section>

      {/* How it works */}
      <section className="grid gap-4 pb-16 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={s.title} className="rounded-xl border border-border bg-panel p-6">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent">
                <s.icon className="h-4 w-4" />
              </span>
              <span className="text-xs font-semibold text-muted">Step {i + 1}</span>
            </div>
            <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </section>

      {/* CTA band */}
      <section className="mb-20 rounded-2xl border border-border bg-gradient-to-br from-panel to-panel-2 px-6 py-12 text-center">
        <h2 className="text-2xl font-bold">Planning a trip with friends?</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Spin up a board in under a minute, share the link, and let the group decide together.
        </p>
        <div className="mt-6">
          <Button variant="primary" size="lg" onClick={primary}>
            <Plus className="h-4 w-4" /> {user ? 'Start a trip' : 'Create your first trip'}
          </Button>
        </div>
      </section>
    </div>
  );
}

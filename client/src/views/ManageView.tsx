import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, Users, ThumbsUp, Star, Home, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';
import type { TripPulse } from '@/types';

export function ManageView() {
  const { trip, isOwner } = useApp();
  const [pulse, setPulse] = useState<TripPulse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (trip && isOwner) api.tripPulse(trip.id).then(setPulse).catch(() => {});
  }, [trip, isOwner]);

  if (!trip) return null;

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <p className="text-lg font-semibold">Organizer only</p>
        <p className="mt-2 text-sm text-muted">Only the trip organizer can manage this trip.</p>
        <Button asChild variant="primary" className="mt-4">
          <Link to={`/t/${trip.id}/board`}>Back to the board</Link>
        </Button>
      </div>
    );
  }

  const inviteLink = trip.join_code
    ? `${window.location.origin}/#/t/${trip.id}/board?join=${trip.join_code}`
    : `${window.location.origin}/#/t/${trip.id}/board`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link to={`/t/${trip.id}/board`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Back to board
      </Link>
      <h1 className="mt-3 text-2xl font-bold">Manage · {trip.name}</h1>

      {/* Invite */}
      <section className="mt-6 rounded-xl border border-border bg-panel p-5">
        <h2 className="font-semibold">Invite your group</h2>
        <p className="mt-1 text-sm text-muted">
          Anyone with this link can view the board. They sign in to vote, add homes, or comment.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            readOnly
            value={inviteLink}
            onFocus={(e) => e.currentTarget.select()}
            className="h-10 flex-1 rounded-md border border-border bg-panel-2 px-3 text-sm text-text outline-none"
          />
          <Button variant="primary" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </section>

      {/* Pulse */}
      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Users} label="Members" value={pulse?.members ?? trip.memberCount} />
        <Stat icon={Home} label="Homes" value={pulse?.listings} />
        <Stat icon={ThumbsUp} label="Votes" value={pulse?.votes} />
        <Stat icon={Star} label="Top picks" value={pulse?.picks} />
      </section>

      <p className="mt-6 text-xs text-muted">
        Organizer powers: post the itinerary, remove listings, and lock the official pick — all from
        the board. {pulse?.decisionLocked ? 'An official pick is currently locked.' : 'No official pick locked yet.'}
      </p>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number | undefined }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <Icon className="h-4 w-4 text-muted" />
      <div className="mt-2 text-2xl font-bold">{value ?? '—'}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

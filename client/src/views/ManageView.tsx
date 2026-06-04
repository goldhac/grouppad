import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Check, Users, ThumbsUp, Star, Home, ArrowLeft, Trash2, Send, MessageSquareText } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';
import type { TripPulse } from '@/types';

export function ManageView() {
  const { trip, isOwner, deleteTrip, toast, refreshAllReviews } = useApp();
  const navigate = useNavigate();
  const [pulse, setPulse] = useState<TripPulse | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [emails, setEmails] = useState('');
  const [sending, setSending] = useState(false);
  const [revBusy, setRevBusy] = useState(false);

  async function onFetchReviews() {
    setRevBusy(true);
    try {
      const r = await refreshAllReviews();
      toast(
        r.fetched ? `Fetched reviews for ${r.fetched} home${r.fetched === 1 ? '' : 's'}.` : 'All homes already have reviews.',
        'success',
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not fetch reviews.', 'error');
    } finally {
      setRevBusy(false);
    }
  }

  async function sendInvites() {
    if (!trip || !emails.trim()) return;
    setSending(true);
    try {
      const r = await api.invite(trip.id, emails.trim());
      if (r.sent) {
        toast(`Invite sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}.`, 'success');
        setEmails('');
      } else {
        toast('No valid email addresses found.', 'error');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not send invites.', 'error');
    } finally {
      setSending(false);
    }
  }

  async function onDelete() {
    if (!trip) return;
    if (!confirm(`Delete “${trip.name}”? This removes the board and all its data for everyone. This can't be undone.`)) return;
    setDeleting(true);
    try {
      await deleteTrip(trip.id);
      toast('Trip deleted.', 'success');
      navigate('/trips');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not delete the trip.', 'error');
      setDeleting(false);
    }
  }

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

        <div className="mt-4 border-t border-border pt-4">
          <label className="text-sm font-medium">Or invite by email</label>
          <p className="mt-1 text-xs text-muted">
            We'll email each person a one-tap link to join. Separate addresses with commas or spaces.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="alex@email.com, sam@email.com"
              className="h-10 flex-1 rounded-md border border-border bg-panel-2 px-3 text-sm text-text outline-none focus:ring-2 focus:ring-accent"
            />
            <Button variant="primary" disabled={sending || !emails.trim()} onClick={() => void sendInvites()}>
              <Send className="h-4 w-4" /> {sending ? 'Sending…' : 'Send invites'}
            </Button>
          </div>
        </div>
      </section>

      {/* Pulse */}
      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Users} label="Members" value={pulse?.members ?? trip.memberCount} />
        <Stat icon={Home} label="Homes" value={pulse?.listings} />
        <Stat icon={ThumbsUp} label="Votes" value={pulse?.votes} />
        <Stat icon={Star} label="Top picks" value={pulse?.picks} />
      </section>

      {/* Reviews */}
      <section className="mt-4 rounded-xl border border-border bg-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Guest reviews</h2>
            <p className="mt-1 max-w-md text-sm text-muted">
              Pull the latest positive &amp; negative reviews for every home, so they show on the cards and
              detail view. Cached after the first fetch — only homes without reviews yet cost anything.
            </p>
          </div>
          <Button variant="default" disabled={revBusy} onClick={() => void onFetchReviews()}>
            <MessageSquareText className="h-4 w-4" /> {revBusy ? 'Fetching…' : 'Fetch all reviews'}
          </Button>
        </div>
      </section>

      <p className="mt-6 text-xs text-muted">
        Organizer powers: post the itinerary, remove listings, and lock the official pick — all from
        the board. {pulse?.decisionLocked ? 'An official pick is currently locked.' : 'No official pick locked yet.'}
      </p>

      {/* Danger zone */}
      <section className="mt-8 rounded-xl border border-danger/30 bg-danger/5 p-5">
        <h2 className="font-semibold text-danger">Danger zone</h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-sm text-sm text-muted">
            Deleting this trip removes the board, its listings, votes, and everything else for every
            member. This cannot be undone.
          </p>
          <Button variant="danger" disabled={deleting} onClick={() => void onDelete()}>
            <Trash2 className="h-4 w-4" /> {deleting ? 'Deleting…' : 'Delete trip'}
          </Button>
        </div>
      </section>
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

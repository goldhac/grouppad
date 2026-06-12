import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { useFocusTrap } from '@/lib/useFocusTrap';

const seenKey = (id: string) => `gp_invite_seen_${id}`;

/** Short, year-aware date range, e.g. "Aug 18–23" or "Dec 30 – Jan 3". */
function dateRange(a?: string, b?: string): string {
  if (!a) return '';
  const d1 = new Date(a + 'T00:00:00');
  const d2 = b ? new Date(b + 'T00:00:00') : null;
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  if (!d2 || isNaN(d2.getTime())) return `${mon(d1)} ${d1.getDate()}`;
  return d1.getMonth() === d2.getMonth()
    ? `${mon(d1)} ${d1.getDate()}–${d2.getDate()}`
    : `${mon(d1)} ${d1.getDate()} – ${mon(d2)} ${d2.getDate()}`;
}

/** First thing an invited guest sees: a celebratory welcome with who invited them,
 *  what GroupPad is, and a one-tap path to create an account (which auto-joins and
 *  starts the tour). "Browse first" runs the guided site walkthrough. Sits on top
 *  of the board so the homes stay visible behind it; shown once per trip. */
export function InviteWelcome() {
  const { trip, user, openAuth, startSiteTour } = useApp();
  const [params] = useSearchParams();
  const inviteCode = params.get('join');
  const [dismissed, setDismissed] = useState(false);
  const scrimRef = useRef<HTMLDivElement>(null);

  const eligible = !!inviteCode && !user && !!trip && !trip.isMember;

  useEffect(() => {
    if (eligible && trip) {
      try { if (localStorage.getItem(seenKey(trip.id))) setDismissed(true); } catch { /* ignore */ }
    }
  }, [eligible, trip]);

  const open = eligible && !dismissed && !!trip;
  useFocusTrap(scrimRef, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') markSeen(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !trip) return null;

  function markSeen() {
    try { localStorage.setItem(seenKey(trip!.id), '1'); } catch { /* ignore */ }
    setDismissed(true);
  }

  function createAccount() {
    // Remember the invite so the magic-link round-trip auto-joins this trip and
    // lands the new member on its board (then first sign-in starts onboarding).
    try {
      if (inviteCode) localStorage.setItem('gp_pending_join', JSON.stringify({ tripId: trip!.id, code: inviteCode }));
    } catch { /* ignore */ }
    markSeen();
    openAuth('join the trip');
  }

  function browseFirst() {
    markSeen();
    // Walk them around the actual board (the "show me around" guided tour), so a
    // guest who just wants to look still gets oriented on the real UI.
    startSiteTour();
  }

  const facts = [
    trip.destination,
    dateRange(trip.checkin, trip.checkout_5n),
    trip.adults ? `${trip.adults} guests` : '',
    trip.memberCount ? `${trip.memberCount} in the group` : '',
  ].filter(Boolean);
  const inviter = trip.owner_name;

  return (
    <div className="modal-scrim open" ref={scrimRef} onClick={markSeen}>
      <div className="modal iw-modal" role="dialog" aria-modal="true" aria-labelledby="iwTitle" onClick={(e) => e.stopPropagation()}>
        <button className="modal-x" aria-label="Close" onClick={markSeen}><Icon icon={X} className="ico" /></button>
        <div className="iw-hero" aria-hidden>
          <img src="/invite-welcome.jpg" alt="" loading="eager" decoding="async" />
        </div>
        <div className="au-body">
          <div className="au-h" style={{ textAlign: 'center' }}>
            <div className="reason" style={{ justifyContent: 'center' }}><Icon icon={Sparkles} className="ico" /> {inviter ? `${inviter} invited you` : "You’re invited"}</div>
            <h2 id="iwTitle">{trip.name || 'Join the trip'}</h2>
            <p>GroupPad is where your group compares rentals, votes on favorites, and picks one together. Take a look around — the homes are below.</p>
          </div>
          {facts.length > 0 && (
            <div className="iw-facts">
              {facts.map((f, i) => <span className="iw-chip" key={i}>{f}</span>)}
            </div>
          )}
          <div className="au-methods">
            <button className="btn btn-primary au-submit" onClick={createAccount}>Create your account</button>
            <button className="btn btn-ghost iw-browse" onClick={browseFirst}>Browse the homes first</button>
          </div>
          <p className="au-fine">No password — just a one-tap email link. You can look around first; you’ll need an account to vote or save.</p>
        </div>
      </div>
    </div>
  );
}

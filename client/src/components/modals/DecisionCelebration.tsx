import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ExternalLink, Lock, Users } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { useFocusTrap } from '@/lib/useFocusTrap';
import { fmt } from '@/lib/utils';

// Seen-once per (trip, winning home): if the organizer unlocks and locks a
// different home, the group gets the moment again for the new winner.
const seenKey = (tripId: string, listingId: string) => `gp_decision_seen_${tripId}_${listingId}`;
const BITS = 46;

/** The payoff moment: the first time you open the board after the group locked an
 *  official pick, the winner is revealed centre-stage with a confetti burst and a
 *  direct link to book it. Shown once per locked home, per person. */
export function DecisionCelebration() {
  const { trip, final, findListing, split } = useApp();
  const [dismissed, setDismissed] = useState(true); // default hidden until we've checked storage
  const scrimRef = useRef<HTMLDivElement>(null);

  const decision = final.decision;
  const listing = decision ? findListing(decision.listing_id) : undefined;

  // Only celebrate once per locked home. Re-checks when the decision changes.
  useEffect(() => {
    if (!trip || !decision) { setDismissed(true); return; }
    try { setDismissed(!!localStorage.getItem(seenKey(trip.id, decision.listing_id))); }
    catch { setDismissed(false); }
  }, [trip, decision]);

  const open = !!trip && !!decision && !!listing && !dismissed;
  useFocusTrap(scrimRef, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') markSeen(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Deterministic-enough confetti: each bit gets its own lane, delay, spin and hue.
  const bits = useMemo(
    () => Array.from({ length: BITS }, (_, i) => ({
      left: (i / BITS) * 100 + (Math.random() * 4 - 2),
      delay: Math.random() * 1.6,
      dur: 2.4 + Math.random() * 1.8,
      rot: Math.random() * 360,
      drift: (Math.random() * 2 - 1) * 60,
      hue: i % 4,
      round: i % 5 === 0,
    })),
    [],
  );

  if (!open || !trip || !decision || !listing) return null;

  function markSeen() {
    try { localStorage.setItem(seenKey(trip!.id, decision!.listing_id), '1'); } catch { /* ignore */ }
    setDismissed(true);
  }

  const pp = listing.est_5n ? Math.ceil(listing.est_5n / split) : null;
  const specs = [
    listing.bd != null ? `${listing.bd} bed` : null,
    listing.ba != null ? `${listing.ba} bath` : null,
    listing.sleeps != null ? `sleeps ${listing.sleeps}` : null,
  ].filter(Boolean).join(' · ');
  const srcLabel = listing.source ? listing.source[0].toUpperCase() + listing.source.slice(1).toLowerCase() : 'the listing';

  return (
    <div
      className="dc-scrim"
      ref={scrimRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dc-title"
      onClick={(e) => { if (e.target === e.currentTarget) markSeen(); }}
    >
      <div className="dc-confetti" aria-hidden="true">
        {bits.map((b, i) => (
          <i
            key={i}
            className={`dc-bit h${b.hue}${b.round ? ' rd' : ''}`}
            style={{
              left: `${b.left}%`,
              animationDelay: `${b.delay}s`,
              animationDuration: `${b.dur}s`,
              ['--rot' as string]: `${b.rot}deg`,
              ['--drift' as string]: `${b.drift}px`,
            }}
          />
        ))}
      </div>

      <div className="dc-card">
        <button className="dc-x" onClick={markSeen} aria-label="Close">
          <Icon icon={X} className="ico" />
        </button>

        <span className="dc-seal"><Icon icon={Lock} className="ico" /></span>
        <div className="dc-eyebrow">Official pick · locked</div>
        <h2 id="dc-title" className="dc-title">It&rsquo;s official</h2>
        <p className="dc-sub">Your group picked the place for {trip.name}.</p>

        {listing.photos?.[0] && (
          <img className="dc-photo" src={listing.photos[0]} alt={listing.name} loading="lazy" />
        )}

        <h3 className="dc-name">{listing.name}</h3>
        {(listing.area || specs) && (
          <p className="dc-meta">{[listing.area, specs].filter(Boolean).join(' · ')}</p>
        )}

        {listing.est_5n != null && (
          <div className="dc-money">
            <div className="m">
              <span className="k">Est. all-in · 5 nights</span>
              <span className="v tnum">{fmt(listing.est_5n)}</span>
            </div>
            {pp != null && (
              <div className="m pp">
                <span className="k"><Icon icon={Users} className="ico" /> Your share</span>
                <span className="v tnum">{fmt(pp)}</span>
              </div>
            )}
          </div>
        )}

        <div className="dc-actions">
          <a
            className="btn btn-primary btn-lg"
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={markSeen}
          >
            Open on {srcLabel} <Icon icon={ExternalLink} className="ico" />
          </a>
          <button className="btn btn-lg" onClick={markSeen}>See the board</button>
        </div>
        <p className="dc-fine">GroupPad doesn&rsquo;t book — verify the all-in total at checkout.</p>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown, Star, ExternalLink, MapPin, Plane, FerrisWheel, Pin, BadgeCheck, Link2 } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { BudgetBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { amenityLabel, fmt, fmtMins, tallyVotes } from '@/lib/utils';
import type { ReviewSnippet } from '@/types';

function DistIcon({ kind }: { kind?: string }) {
  const Icon = kind === 'airport' ? Plane : kind === 'attraction' ? FerrisWheel : MapPin;
  return <Icon className="h-4 w-4" aria-hidden />;
}

/** One sentiment column of review snippets in the detail modal. */
function ReviewList({ title, tone, items }: { title: string; tone: 'pos' | 'neg'; items: ReviewSnippet[] }) {
  return (
    <div>
      <div className={cn('mb-1.5 inline-flex items-center gap-1 text-xs font-semibold', tone === 'pos' ? 'text-accent' : 'text-warn')}>
        {tone === 'pos' ? <ThumbsUp className="h-3.5 w-3.5" /> : <ThumbsDown className="h-3.5 w-3.5" />}
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted">—</p>
      ) : (
        <ul className="space-y-2">
          {items.map((r, i) => (
            <li key={i} className="rounded-lg border border-border bg-panel-2 p-2.5 text-xs">
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-muted">
                {r.rating != null && (
                  <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3 fill-current" />{r.rating}</span>
                )}
                {r.author && <span>· {r.author}</span>}
                {r.date && <span className="opacity-70">· {r.date}</span>}
              </div>
              <p className="leading-relaxed text-text">{r.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DetailModal() {
  const {
    detailId, closeDetail, findListing, trip, split,
    user, votes, final, isOwner, castVote, toggleFinalPick, setDecision, requireSignIn,
    reviewsMap, loadReviewsFor,
  } = useApp();

  const l = detailId ? findListing(detailId) : undefined;
  const [photoIdx, setPhotoIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [refIdx, setRefIdx] = useState(0); // which reference point the map routes to
  const [revLoading, setRevLoading] = useState(false);
  useEffect(() => {
    setPhotoIdx(0);
    setRefIdx(0);
  }, [detailId]);

  // Lazily fetch reviews the first time a listing's detail is opened (members only;
  // cached after the first fetch so it never re-spends).
  useEffect(() => {
    if (!l || !user || reviewsMap[`${l.source}:${l.id}`]) return;
    let active = true;
    setRevLoading(true);
    loadReviewsFor(l).finally(() => { if (active) setRevLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId, l?.id, user?.id]);

  const copyLink = async () => {
    if (!trip || !l) return;
    const url = `${window.location.origin}/#/t/${trip.id}/board?listing=${encodeURIComponent(l.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  if (!l) {
    return (
      <Dialog open={false} onOpenChange={(o) => !o && closeDetail()}>
        <span />
      </Dialog>
    );
  }

  const tally = tallyVotes(votes, l.id, user?.id ?? null);
  const isMyPick = final.myPick === l.id;
  const isDecision = final.decision?.listing_id === l.id;
  const budget = trip?.budget ?? 7000;
  const photos = l.photos ?? [];
  const pp = l.est_5n ? Math.ceil(l.est_5n / split) : null;
  const mapQuery = encodeURIComponent(`${l.area ?? ''} ${trip?.destination ?? 'Los Angeles'}`);
  // Map re-centers on the toggled reference point (downtown by default); the chips
  // carry the distance + drive time. (Keyless directions embeds no longer render,
  // so we center on the place via the reliable q= embed.)
  const dists = l.distances ?? [];
  const activeRef = dists[refIdx] ?? null;
  const mapSrc = activeRef
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${activeRef.label} ${trip?.destination ?? ''}`.trim())}&z=11&output=embed`
    : `https://www.google.com/maps?q=${mapQuery}&z=11&output=embed`;

  return (
    <Dialog open onOpenChange={(o) => !o && closeDetail()}>
      <DialogContent width="max-w-2xl">
        <div className="flex items-start gap-2 pr-8">
          <DialogTitle className="text-lg font-bold leading-snug">{l.name}</DialogTitle>
          {isDecision && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Official pick
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="rounded bg-panel-2 px-1.5 py-0.5">{l.source}</span>
          {l.area && <span>{l.area}</span>}
          {!l.distances?.length && l.distance_mi != null && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="h-3 w-3" /> {l.distance_mi} mi to downtown
            </span>
          )}
        </div>

        {l.distances?.length ? (
          <div className="flex flex-wrap gap-2">
            {l.distances.map((d, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-panel-2 px-2.5 py-1.5 text-xs"
              >
                <DistIcon kind={d.kind} />
                <span>
                  <span className="font-medium text-text">{d.label}</span>
                  <span className="text-muted"> · {d.mi} mi · {fmtMins(d.min)}</span>
                </span>
              </span>
            ))}
          </div>
        ) : null}

        {/* Gallery */}
        {photos.length > 0 && (
          <div className="flex flex-col gap-2">
            <img
              src={photos[photoIdx]}
              alt={l.name}
              className="aspect-[16/10] w-full rounded-lg object-cover"
            />
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
                {photos.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setPhotoIdx(i)}
                    className={cn(
                      'h-14 w-20 shrink-0 overflow-hidden rounded-md border-2',
                      i === photoIdx ? 'border-accent' : 'border-transparent opacity-70',
                    )}
                  >
                    <img src={p} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Specs + reviews */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {l.bd != null && <span>{l.bd} bd</span>}
          {l.ba != null && <span>{l.ba} ba</span>}
          {l.sleeps != null && <span>sleeps {l.sleeps}</span>}
          <span className="text-muted">
            {l.rating != null
              ? `${l.rating}★ (${l.reviews ?? 0} reviews)${l.superhost ? ' · Superhost' : ''}`
              : 'no rating yet'}
          </span>
        </div>

        {/* Price breakdown */}
        <div className="rounded-lg border border-border bg-panel-2 p-3 text-sm">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-lg font-bold">{fmt(l.est_5n)}</span>
            <BudgetBadge tier={l.budget} />
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
            <Row label="5-night est all-in" value={fmt(l.est_5n)} />
            <Row label="Displayed (5n)" value={fmt(l.displayed_5n)} />
            <Row label="4-night est" value={fmt(l.est_4n)} />
            {pp != null && (
              <Row
                label={`Per person (÷${split})`}
                value={fmt(pp)}
                tone={l.est_5n != null && l.est_5n > budget ? 'danger' : 'accent'}
              />
            )}
          </dl>
        </div>

        {l.note && <p className="text-sm leading-relaxed text-muted">{l.note}</p>}

        {/* Amenities */}
        {(l.amenities?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {l.amenities!.map((a) => {
              const am = amenityLabel(a, 'unknown');
              return (
                <span key={a} className="rounded-full bg-panel-2 px-2 py-0.5 text-muted">
                  {am.text.replace('? ', '')}
                </span>
              );
            })}
          </div>
        )}

        {/* Guest reviews — lazy-loaded on open, cached, split by star rating */}
        {(() => {
          const rev = reviewsMap[`${l.source}:${l.id}`];
          const supported = /airbnb|vrbo/i.test(String(l.source));
          if (rev || revLoading) {
            return (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Guest reviews{rev ? ` · ${rev.total}` : ''}</h3>
                {revLoading && !rev ? (
                  <p className="text-xs text-muted">Loading reviews…</p>
                ) : rev && (rev.pos.length > 0 || rev.neg.length > 0) ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ReviewList title="Loved it" tone="pos" items={rev.pos} />
                    <ReviewList title="Concerns" tone="neg" items={rev.neg} />
                  </div>
                ) : (
                  <p className="text-xs text-muted">No written reviews available for this home.</p>
                )}
              </div>
            );
          }
          if (supported && !user) {
            return <p className="text-xs text-muted">Sign in to load guest reviews for this home.</p>;
          }
          return null;
        })()}

        {/* Map — routes to a reference point; toggle the 3 (defaults to downtown) */}
        {dists.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {dists.map((d, i) => (
              <button
                key={i}
                onClick={() => setRefIdx(i)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors',
                  i === refIdx
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border text-muted hover:text-text',
                )}
              >
                <DistIcon kind={d.kind} />
                <span className="font-medium">{d.label}</span>
                <span className="opacity-70">· {d.mi} mi · {fmtMins(d.min)}</span>
              </button>
            ))}
          </div>
        )}
        <iframe
          key={mapSrc}
          title={activeRef ? `Route to ${activeRef.label}` : 'Area map'}
          className="aspect-[16/7] w-full rounded-lg border border-border"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={mapSrc}
        />

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex items-center gap-3">
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
          >
            {l.check_manual ? 'Check manually' : `View on ${l.source}`} <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            onClick={() => void copyLink()}
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"
            title="Copy a shareable link to this home"
          >
            <Link2 className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy link'}
          </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void castVote(l.id, 'up')}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm',
                tally.mine === 'up' ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted hover:text-text',
              )}
            >
              <ThumbsUp className="h-4 w-4" /> {tally.up}
            </button>
            <button
              onClick={() => void castVote(l.id, 'down')}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm',
                tally.mine === 'down' ? 'border-danger bg-danger/15 text-danger' : 'border-border text-muted hover:text-text',
              )}
            >
              <ThumbsDown className="h-4 w-4" /> {tally.down}
            </button>
            <button
              onClick={() => {
                if (requireSignIn('cast your top choice')) void toggleFinalPick(l.id);
              }}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm',
                isMyPick ? 'border-warn bg-warn/15 text-warn' : 'border-border text-muted hover:text-text',
              )}
            >
              <Star className={cn('h-4 w-4', isMyPick && 'fill-warn')} /> {isMyPick ? 'My pick' : 'Top choice'}
            </button>
            {isOwner && (
              <Button
                variant={isDecision ? 'primary' : 'default'}
                size="sm"
                onClick={() => void setDecision(isDecision ? null : l.id)}
              >
                <Pin className="h-3.5 w-3.5" /> {isDecision ? 'Unlock' : 'Make official'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'accent' }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={cn('text-right font-medium text-text', tone === 'danger' && 'text-danger', tone === 'accent' && 'text-accent')}>
        {value}
      </dd>
    </>
  );
}

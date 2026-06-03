import { useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown, Star, ExternalLink, MapPin, Pin } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { BudgetBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { amenityLabel, fmt, tallyVotes } from '@/lib/utils';

export function DetailModal() {
  const {
    detailId, closeDetail, findListing, trip, split,
    user, votes, final, isOwner, castVote, toggleFinalPick, setDecision, requireSignIn,
  } = useApp();

  const l = detailId ? findListing(detailId) : undefined;
  const [photoIdx, setPhotoIdx] = useState(0);
  useEffect(() => setPhotoIdx(0), [detailId]);

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

  return (
    <Dialog open onOpenChange={(o) => !o && closeDetail()}>
      <DialogContent width="max-w-2xl">
        <div className="flex items-start gap-2 pr-8">
          <DialogTitle className="text-lg font-bold leading-snug">{l.name}</DialogTitle>
          {isDecision && (
            <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
              ✅ Official pick
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="rounded bg-panel-2 px-1.5 py-0.5">{l.source}</span>
          {l.area && <span>{l.area}</span>}
          {l.distance_mi != null && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="h-3 w-3" /> {l.distance_mi} mi from DTLA
            </span>
          )}
        </div>

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

        {/* Map */}
        <iframe
          title="Area map"
          className="aspect-[16/7] w-full rounded-lg border border-border"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={`https://www.google.com/maps?q=${mapQuery}&z=11&output=embed`}
        />

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-link hover:underline"
          >
            {l.check_manual ? 'Check manually' : `View on ${l.source}`} <ExternalLink className="h-3.5 w-3.5" />
          </a>

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

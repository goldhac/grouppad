import { ThumbsUp, ThumbsDown, Star, Trash2, ExternalLink, MapPin, Pin } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Badge, BudgetBadge } from '@/components/ui/Badge';
import { Carousel } from '@/components/Carousel';
import { cn } from '@/lib/cn';
import { amenityLabel, fmt, fmtMins, tallyVotes } from '@/lib/utils';
import type { Listing } from '@/types';

interface CardProps {
  listing: Listing;
  isSubmitted?: boolean;
  isPipeline?: boolean;
}

const INTERACTIVE = 'a, button, input, label, [role="checkbox"]';

export function Card({ listing: l, isSubmitted = false, isPipeline = false }: CardProps) {
  const {
    user, votes, final, isOwner, split, trip, selected,
    castVote, toggleFinalPick, setDecision, deleteListing, toggleSelect, openDetail, requireSignIn,
  } = useApp();

  const tally = tallyVotes(votes, l.id, user?.id ?? null);
  const finalCount = final.counts[l.id] ?? 0;
  const isMyPick = final.myPick === l.id;
  const isDecision = final.decision?.listing_id === l.id;
  const isSelected = selected.has(l.id);
  const budget = trip?.budget ?? 7000;
  const pp = l.est_5n ? Math.ceil(l.est_5n / split) : null;
  const ppOver = l.est_5n != null && l.est_5n > budget;

  const onCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    openDetail(l.id);
  };

  const highlights = (l.amenities ?? [])
    .filter((a) => /guest favorite|superhost|washer|dryer/i.test(a))
    .slice(0, 3);

  return (
    <article
      onClick={onCardClick}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-panel transition-colors hover:border-[#384152]',
        isDecision ? 'border-accent ring-1 ring-accent' : 'border-border',
        isSubmitted && 'border-link/40',
        isPipeline && 'border-accent/30',
        isSelected && 'ring-2 ring-link',
      )}
    >
      {isDecision && (
        <div className="absolute left-0 top-0 z-10 rounded-br-lg bg-accent px-2 py-1 text-[11px] font-bold text-[#06210f]">
          ✅ Official pick
        </div>
      )}

      <Carousel photos={l.photos} alt={l.name} />

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        {/* Rank + budget row */}
        <div className="flex items-center justify-between gap-2">
          <Badge className={cn(isPipeline && 'border-accent/40 text-accent', isSubmitted && 'border-link/40 text-link')}>
            {isPipeline
              ? 'live'
              : isSubmitted
                ? 'community submission'
                : l.rank != null && l.rank <= 3
                  ? `★ Rank ${l.rank}`
                  : l.rank != null
                    ? `Rank ${l.rank}`
                    : l.source}
          </Badge>
          <BudgetBadge tier={l.budget} />
        </div>

        {/* Name + location */}
        <h2 className="text-[15px] font-semibold leading-snug">{l.name}</h2>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span className="rounded bg-panel-2 px-1.5 py-0.5">{l.source}</span>
          {l.area && <span>{l.area}</span>}
        </div>
        {l.distances?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {l.distances.map((d, i) => (
              <span
                key={i}
                title={d.label}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-panel-2 px-2 py-0.5 text-[10.5px] text-muted"
              >
                <span>{d.icon}</span>
                <span className="font-medium text-text">{d.mi} mi</span>
                <span className="opacity-50">·</span>
                <span>{fmtMins(d.min)}</span>
              </span>
            ))}
          </div>
        ) : l.distance_mi != null ? (
          <div className="text-[11px] text-muted">
            <MapPin className="mr-0.5 inline h-3 w-3" />
            {l.distance_mi} mi to downtown
          </div>
        ) : null}

        {/* Specs */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-text">
          {l.bd != null && <span>{l.bd} bd</span>}
          {l.ba != null && <span>{l.ba} ba</span>}
          {l.sleeps != null && <span>sleeps {l.sleeps}</span>}
        </div>

        {/* Amenities */}
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <AmenityChip k="pool" v={l.pool} />
          {l.hot_tub === 'yes' && <AmenityChip k="hot tub" v="yes" />}
          <AmenityChip k="parking" v={l.parking} />
          {highlights.map((a) => (
            <span key={a} className="rounded-full border border-warn/30 bg-warn/10 px-2 py-0.5 text-warn">
              ★ {a}
            </span>
          ))}
        </div>

        {/* Reviews */}
        <div className="text-xs text-muted">
          {l.rating != null
            ? `${l.rating}★ (${l.reviews ?? 0} reviews)${l.superhost ? ' · Superhost' : ''}`
            : l.reviews
              ? `${l.reviews} reviews`
              : 'no rating yet'}
        </div>

        {/* Price */}
        <div className="mt-auto flex items-baseline justify-between gap-2 pt-1">
          <span className="text-lg font-bold">{fmt(l.est_5n)}</span>
          <span className="text-[11px] text-muted">est all-in · 5 nights</span>
        </div>
        <div className="text-[11px] text-muted">
          {l.displayed_5n != null
            ? `displayed: ${fmt(l.displayed_5n)} for 5 nights · 4-night est: ${fmt(l.est_4n)}`
            : 'price on inquiry'}
        </div>

        {/* Per person */}
        {pp != null && (
          <div className={cn('text-xs font-medium', ppOver ? 'text-danger' : 'text-accent')}>
            {fmt(pp)} per person · split {split} ways
          </div>
        )}

        {l.note && <p className="text-xs leading-relaxed text-muted">{l.note}</p>}
        {isSubmitted && l.submitted_by && (
          <p className="text-[11px] text-link">
            Submitted by {l.submitted_by}
            {l.submitted_at ? ` · ${l.submitted_at}` : ''}
          </p>
        )}

        {/* Compare select */}
        <label className="flex items-center gap-2 text-xs text-muted" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(l.id)}
            className="h-3.5 w-3.5 accent-[var(--link)]"
          />
          compare
        </label>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-link hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {l.check_manual ? 'Check manually' : `View on ${l.source}`} <ExternalLink className="h-3 w-3" />
          </a>

          <div className="flex items-center gap-1">
            <VoteBtn
              dir="up"
              count={tally.up}
              active={tally.mine === 'up'}
              onClick={() => void castVote(l.id, 'up')}
            />
            <VoteBtn
              dir="down"
              count={tally.down}
              active={tally.mine === 'down'}
              onClick={() => void castVote(l.id, 'down')}
            />
          </div>
        </div>

        {/* Final pick + official */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (requireSignIn('cast your top choice')) void toggleFinalPick(l.id);
            }}
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              isMyPick
                ? 'border-warn bg-warn/15 text-warn'
                : 'border-border text-muted hover:text-text',
            )}
          >
            <Star className={cn('h-3.5 w-3.5', isMyPick && 'fill-warn')} />
            {isMyPick ? 'My pick' : 'Top choice'}
            {finalCount > 0 && (
              <span className="ml-0.5 rounded-full bg-panel-2 px-1.5 text-[10px]">{finalCount}</span>
            )}
          </button>

          {isOwner && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                void setDecision(isDecision ? null : l.id);
              }}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                isDecision ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted hover:text-text',
              )}
            >
              <Pin className="h-3.5 w-3.5" />
              {isDecision ? 'Unlock' : 'Make official'}
            </button>
          )}
        </div>

        {/* Admin delete */}
        {isOwner && !isPipeline && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Remove this listing?')) void deleteListing(l.id, isSubmitted);
            }}
            className="inline-flex items-center gap-1 self-start text-[11px] text-danger hover:underline"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        )}
      </div>
    </article>
  );
}

function AmenityChip({ k, v }: { k: string; v: Listing['pool'] }) {
  const a = amenityLabel(k, v);
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5',
        a.state === 'yes' && 'bg-accent/10 text-accent',
        a.state === 'no' && 'bg-danger/10 text-danger',
        a.state === 'unknown' && 'bg-panel-2 text-muted',
      )}
    >
      {a.text}
    </span>
  );
}

function VoteBtn({
  dir,
  count,
  active,
  onClick,
}: {
  dir: 'up' | 'down';
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = dir === 'up' ? ThumbsUp : ThumbsDown;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={dir === 'up' ? 'Like' : 'Dislike'}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors',
        active
          ? dir === 'up'
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-danger bg-danger/15 text-danger'
          : 'border-border text-muted hover:text-text',
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {count}
    </button>
  );
}

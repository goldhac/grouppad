import { ThumbsUp, ThumbsDown, Star, Trash2, ExternalLink, MapPin, Plane, FerrisWheel, Lock, Clapperboard } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Carousel } from '@/components/Carousel';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { amenityLabel, fmt, fmtMins, tallyVotes } from '@/lib/utils';
import type { Listing } from '@/types';

interface CardProps {
  listing: Listing;
  isSubmitted?: boolean;
  isPipeline?: boolean;
}

const INTERACTIVE = 'a, button, input, label, [role="checkbox"]';

const BUDGET_LABEL: Record<string, string> = {
  under: 'under budget', marginal: 'marginal', over: 'over budget', unknown: 'price TBD',
};

function DistIcon({ kind }: { kind?: string }) {
  const I = kind === 'airport' ? Plane : kind === 'attraction' ? FerrisWheel : MapPin;
  return <Icon icon={I} className="ico" />;
}

export function Card({ listing: l, isSubmitted = false, isPipeline = false }: CardProps) {
  const {
    user, votes, final, isOwner, split, trip, selected, reviewsMap, toursMap,
    castVote, toggleFinalPick, setDecision, deleteListing, toggleSelect, openDetail, requireSignIn,
  } = useApp();

  const rev = reviewsMap[`${l.source}:${l.id}`];
  const hasTour = toursMap[l.id]?.status === 'ready' && (toursMap[l.id]?.clips.some((c) => c.videoUrl) ?? false);

  const tally = tallyVotes(votes, l.id, user?.id ?? null);
  const net = tally.up - tally.down;
  const isMyPick = final.myPick === l.id;
  const finalCount = final.counts[l.id] ?? 0;
  const isDecision = final.decision?.listing_id === l.id;
  const isSelected = selected.has(l.id);
  const budget = trip?.budget ?? 7000;
  const pp = l.est_5n ? Math.ceil(l.est_5n / split) : null;
  const ppOver = l.est_5n != null && l.est_5n > budget;

  const onCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    openDetail(l.id);
  };

  // primary badge (rank / source provenance)
  const primaryBadge = isPipeline ? (
    <span className="badge badge-live"><span className="dot" /> live</span>
  ) : isSubmitted ? (
    <span className="badge badge-community">community</span>
  ) : l.rank != null && l.rank <= 3 ? (
    <span className="badge badge-rank"><Icon icon={Star} className="ico" /> Rank {l.rank}</span>
  ) : l.rank != null ? (
    <span className="badge badge-rank-soft">Rank {l.rank}</span>
  ) : (
    <span className="badge">{l.source}</span>
  );

  return (
    <article
      onClick={onCardClick}
      className={cn(
        'card',
        isDecision && 'is-official',
        isSelected && 'is-selected',
        (isSubmitted || isPipeline) && 'is-community',
      )}
    >
      <Carousel photos={l.photos} alt={l.name}>
        {isDecision && (
          <span className="corner"><Icon icon={Lock} className="ico" /> Official pick</span>
        )}
        <button
          type="button"
          className={cn('star-btn', isMyPick && 'on')}
          aria-label={isMyPick ? 'Your top choice' : 'Make this your top choice'}
          title={isMyPick ? 'Your top choice' : 'Top choice'}
          onClick={(e) => { e.stopPropagation(); if (requireSignIn('cast your top choice')) void toggleFinalPick(l.id); }}
        >
          <Icon icon={Star} className="ico" />
        </button>
      </Carousel>

      <div className="body">
        <div className="badge-row">
          {primaryBadge}
          <span className={`badge badge-${l.budget ?? 'unknown'}`}>{BUDGET_LABEL[l.budget ?? 'unknown']}</span>
        </div>

        <div className="title">{l.name}</div>

        <div className="meta">
          <span className="tag-source">{l.source}</span>
          {l.area && <span>{l.area}</span>}
          {hasTour && (
            <span className="inline-flex items-center gap-1 text-accent-text">
              <Icon icon={Clapperboard} className="ico" /> Tour
            </span>
          )}
        </div>

        {l.distances?.length ? (
          <div className="dist-row">
            {l.distances.map((d, i) => (
              <span key={i} className="pill-dist" title={d.label}>
                <DistIcon kind={d.kind} />
                <span className="mi tnum">{d.mi} mi</span>
                <span className="sep">·</span>
                <span className="tnum">{fmtMins(d.min)}</span>
              </span>
            ))}
          </div>
        ) : l.distance_mi != null ? (
          <div className="dist-row">
            <span className="pill-dist"><Icon icon={MapPin} className="ico" /> <span className="mi tnum">{l.distance_mi} mi</span> <span className="sep">·</span> downtown</span>
          </div>
        ) : null}

        <div className="specs">
          {l.bd != null && <span>{l.bd} bd</span>}
          {l.bd != null && l.ba != null && <span className="dot-sep">·</span>}
          {l.ba != null && <span>{l.ba} ba</span>}
          {l.sleeps != null && <span className="dot-sep">·</span>}
          {l.sleeps != null && <span>sleeps {l.sleeps}</span>}
        </div>

        <div className="amen-row">
          <AmenityChip k="pool" v={l.pool} />
          {l.hot_tub === 'yes' && <AmenityChip k="hot tub" v="yes" />}
          <AmenityChip k="parking" v={l.parking} />
        </div>

        <div className="reviews">
          {l.rating != null ? (
            <><Icon icon={Star} className="ico" /> {l.rating} <span style={{ color: 'var(--text-muted)' }}>({l.reviews ?? 0} review{l.reviews === 1 ? '' : 's'}){l.superhost ? ' · Superhost' : ''}</span></>
          ) : l.reviews ? (
            <>{l.reviews} reviews</>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>no rating yet</span>
          )}
        </div>

        {rev && (rev.pos.length > 0 || rev.neg.length > 0) && (
          <div className="flex flex-col gap-1">
            {rev.pos[0] && <p className="line-clamp-2 text-[12.5px] italic text-text-muted">“{rev.pos[0].text}”</p>}
            <button onClick={(e) => { e.stopPropagation(); openDetail(l.id); }} className="self-start text-[11.5px] font-semibold text-link hover:underline">read reviews</button>
          </div>
        )}

        <div className="divider" />

        <div className="price">
          <span className="amt tnum">{fmt(l.est_5n)}</span>
          <span className="cap">
            est all-in · 5 nights
            {l.displayed_5n != null && <><br />displayed {fmt(l.displayed_5n)}</>}
          </span>
        </div>

        {pp != null && (
          <span className={cn('perperson', ppOver ? 'bad' : 'ok')}>
            {fmt(pp)} / person · split {split}
          </span>
        )}

        <div className="compare-line">
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="source-link" onClick={(e) => e.stopPropagation()}>
            {l.check_manual ? 'Check manually' : `View on ${l.source}`} <Icon icon={ExternalLink} className="ico" />
          </a>
          <div className="votebar" onClick={(e) => e.stopPropagation()}>
            <button className={cn('vote up', tally.mine === 'up' && 'on')} aria-label="Like" onClick={() => void castVote(l.id, 'up')}>
              <Icon icon={ThumbsUp} className="ico" /> {tally.up}
            </button>
            <span className={cn('net', net > 0 && 'pos', net < 0 && 'neg')}>{net > 0 ? `+${net}` : net}</span>
            <button className={cn('vote down', tally.mine === 'down' && 'on')} aria-label="Dislike" onClick={() => void castVote(l.id, 'down')}>
              <Icon icon={ThumbsDown} className="ico" /> {tally.down}
            </button>
          </div>
        </div>

        <div className="compare-line">
          <label className="flex items-center gap-2 text-[12.5px] text-text-muted" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" className="cbx" checked={isSelected} onChange={() => toggleSelect(l.id)} style={{ accentColor: 'var(--accent)' }} />
            Compare{finalCount > 0 ? ` · ${finalCount} top` : ''}
          </label>
          {isOwner && (
            <button
              className="source-link"
              onClick={(e) => { e.stopPropagation(); void setDecision(isDecision ? null : l.id); }}
            >
              <Icon icon={Lock} className="ico" /> {isDecision ? 'Unlock' : 'Make official'}
            </button>
          )}
        </div>

        {isOwner && !isPipeline && (
          <button className="del" onClick={(e) => { e.stopPropagation(); if (confirm('Remove this listing?')) void deleteListing(l.id, isSubmitted); }}>
            <Icon icon={Trash2} className="ico" /> Delete
          </button>
        )}
      </div>
    </article>
  );
}

function AmenityChip({ k, v }: { k: string; v: Listing['pool'] }) {
  const a = amenityLabel(k, v);
  const tone =
    a.state === 'yes' ? { color: 'var(--under)', background: 'var(--under-bg)' }
      : a.state === 'no' ? { color: 'var(--over)', background: 'var(--over-bg)' }
        : { color: 'var(--text-muted)', background: 'var(--surface-sunken)' };
  return (
    <span style={{ ...tone, fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 'var(--r-pill)' }}>
      {a.text}
    </span>
  );
}

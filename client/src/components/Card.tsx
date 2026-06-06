import { useEffect, useRef, useState } from 'react';
import { ThumbsUp, ThumbsDown, Star, Trash2, ExternalLink, Lock, Users, Check, X, Sparkles, Clapperboard, Quote, Bookmark } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Carousel } from '@/components/Carousel';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { fmt, tallyVotes } from '@/lib/utils';
import type { Listing } from '@/types';

interface CardProps {
  listing: Listing;
  isSubmitted?: boolean;
  isPipeline?: boolean;
  /** Compact mini-card used inside the Community / Live carousel rows. */
  compact?: boolean;
}

const INTERACTIVE = 'a, button, input, label, [role="checkbox"]';
const BUDGET_LABEL: Record<string, string> = {
  under: 'under budget', marginal: 'marginal', over: 'over budget', unknown: 'price TBD',
};

function initials(name?: string | null) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || name[0].toUpperCase();
}

export function Card({ listing: l, isSubmitted = false, isPipeline = false, compact = false }: CardProps) {
  const {
    user, votes, final, isOwner, split, trip, selected, reviewsMap, toursMap, favoriteIds,
    castVote, toggleFinalPick, toggleFavorite, setDecision, deleteListing, toggleSelect, openDetail, requireSignIn,
  } = useApp();
  const isSaved = favoriteIds.has(l.id);

  const rev = reviewsMap[`${l.source}:${l.id}`];
  const hasTour = toursMap[l.id]?.status === 'ready' && (toursMap[l.id]?.clips.some((c) => c.videoUrl) ?? false);
  const tally = tallyVotes(votes, l.id, user?.id ?? null);
  const net = tally.up - tally.down;

  // ── Signature beats ───────────────────────────────────────────────────────
  // "Rose into the shortlist": the instant a home crosses net +1 it lifts.
  const [rose, setRose] = useState(false);
  const prevNet = useRef(net);
  useEffect(() => {
    if (prevNet.current < 1 && net >= 1) {
      setRose(true);
      const t = setTimeout(() => setRose(false), 1000);
      prevNet.current = net;
      return () => clearTimeout(t);
    }
    prevNet.current = net;
  }, [net]);
  // Upvote burst — a little ring/spark pop when you add a like.
  const [burst, setBurst] = useState(0);
  const onUpvote = () => {
    if (tally.mine !== 'up') setBurst((b) => b + 1);
    void castVote(l.id, 'up');
  };
  const isMyPick = final.myPick === l.id;
  const isDecision = final.decision?.listing_id === l.id;
  const isSelected = selected.has(l.id);
  const budget = trip?.budget ?? 7000;
  const pp = l.est_5n ? Math.ceil(l.est_5n / split) : null;
  const ppOver = l.est_5n != null && l.est_5n > budget;
  const isFav = (l.amenities ?? []).some((a) => /guest favorite|superhost/i.test(a)) || l.superhost;

  const onCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    openDetail(l.id);
  };
  const onCardKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    if (e.key === 'Enter') { e.preventDefault(); openDetail(l.id); }
  };

  const primaryBadge = isPipeline ? (
    <span className="badge badge-live"><span className="dot" /> live</span>
  ) : isSubmitted ? (
    <span className="badge badge-community"><Icon icon={Users} className="ico" /> community</span>
  ) : l.rank != null && l.rank <= 3 ? (
    <span className="badge badge-rank"><Icon icon={Star} className="ico" /> Rank {l.rank}</span>
  ) : l.rank != null ? (
    <span className="badge badge-rank-soft">Rank {l.rank}</span>
  ) : (
    <span className="badge">{l.source}</span>
  );

  const photo = (
    <Carousel photos={l.photos} alt={l.name}>
      {isDecision && <span className="corner"><Icon icon={Lock} className="ico" /> Official pick</span>}
      {hasTour && <span className="tourflag"><Icon icon={Clapperboard} className="ico" /> Tour</span>}
      <button
        type="button"
        className={cn('save-btn', isSaved && 'on')}
        aria-label={isSaved ? 'Saved to your shortlist' : 'Save to your shortlist'}
        title={isSaved ? 'Saved — in your shortlist' : 'Save to your shortlist'}
        aria-pressed={isSaved}
        onClick={(e) => { e.stopPropagation(); void toggleFavorite(l.id); }}
      >
        <Icon icon={Bookmark} className="ico" />
      </button>
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
  );

  const votebar = (
    <div className="votebar" onClick={(e) => e.stopPropagation()}>
      <button className={cn('vote up', tally.mine === 'up' && 'on')} aria-label="Like" onClick={onUpvote}>
        <Icon icon={ThumbsUp} className="ico" /> {tally.up}
        {burst > 0 && <span key={burst} className="vote-burst" aria-hidden><i /><i /><i /><i /><i /><i /></span>}
      </button>
      <span className={cn('net', net > 0 && 'pos', net < 0 && 'neg', 'tnum')}>{net > 0 ? `+${net}` : net}</span>
      <button className={cn('vote down', tally.mine === 'down' && 'on')} aria-label="Dislike" onClick={() => void castVote(l.id, 'down')}>
        <Icon icon={ThumbsDown} className="ico" /> {tally.down}
      </button>
    </div>
  );

  const perperson = pp != null && (
    <div className={cn('perperson tnum', ppOver ? 'bad' : 'ok')}>
      <Icon icon={Users} className="ico" /> {fmt(pp)} / person
    </div>
  );

  // ── Compact mini-card (Community / Live carousel rows) ─────────────────────
  if (compact) {
    return (
      <article
        className={cn('card', isDecision && 'is-official', isSelected && 'is-selected', rose && 'rose', (isSubmitted || isPipeline) && 'is-community')}
        role="button" tabIndex={0} onClick={onCardClick} onKeyDown={onCardKey}
      >
        {photo}
        <div className="body compact">
          <div className="badge-row">
            {primaryBadge}
            <span className={`badge badge-${l.budget ?? 'unknown'}`}>{BUDGET_LABEL[l.budget ?? 'unknown']}</span>
          </div>
          <h3 className="title">{l.name}</h3>
          <div className="meta">
            {isSubmitted && l.submitted_by ? (
              <span className="member-chip"><span className="av">{initials(l.submitted_by)}</span> {l.submitted_by}</span>
            ) : (
              <span className="tag-source">{l.source}</span>
            )}
          </div>
          <div className="specs">
            {l.bd != null && <span>{l.bd} bd</span>}
            {l.bd != null && l.sleeps != null && <span className="dot-sep">·</span>}
            {l.sleeps != null && <span>sleeps {l.sleeps}</span>}
          </div>
          <div className="pricerow">
            <span className="amt tnum">{fmt(l.est_5n)}</span>
            {pp != null && (
              <span className={cn('perperson tnum', ppOver ? 'bad' : 'ok')}>
                <Icon icon={Users} className="ico" /> {fmt(pp)}/pp
              </span>
            )}
          </div>
          {votebar}
        </div>
      </article>
    );
  }

  // ── Full card (All-homes / Shortlist grids) ───────────────────────────────
  return (
    <article
      className={cn('card card-bare', isDecision && 'is-official', isSelected && 'is-selected', rose && 'rose')}
      role="button" tabIndex={0} onClick={onCardClick} onKeyDown={onCardKey}
    >
      <div className="card-photowrap">
        {photo}
        <div className="card-badges">
          {primaryBadge}
          <span className={`badge badge-${l.budget ?? 'unknown'}`}>{BUDGET_LABEL[l.budget ?? 'unknown']}</span>
        </div>
      </div>
      <div className="body">
        <h3 className="title">{l.name}</h3>

        {/* one tight meta line — source · area · key specs · rating
            (distances, full reviews, amenities all live in the detail view) */}
        <div className="meta">
          <span className="tag-source">{l.source}</span>
          {l.area && <span>{l.area}</span>}
          {(l.bd != null || l.sleeps != null) && (
            <span>{[l.bd != null ? `${l.bd} bd` : null, l.sleeps != null ? `sleeps ${l.sleeps}` : null].filter(Boolean).join(' · ')}</span>
          )}
          {l.rating != null && <span className="rate"><Icon icon={Star} className="ico" /> {l.rating}</span>}
        </div>

        {/* money zone — all-in + per-person */}
        <div className="card-money">
          <div className="cm-top">
            <div className="price">
              <span className="amt tnum">{fmt(l.est_5n)}</span>
              <span className="cap">est all-in<br />5 nights</span>
            </div>
            {perperson}
          </div>
        </div>

        {/* footer action bar */}
        <div className="card-foot">
          {votebar}
          <label className={cn('cbx', isSelected && 'on')} onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(l.id)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
            <span className="box"><Icon icon={Check} className="ico" /></span> Compare
          </label>
        </div>

        {/* hover/focus reveal — secondary detail */}
        <div className="reveal">
          <div>
            <div className="amen-row">
              <AmenityChip yes={l.pool === 'yes'} no={l.pool === 'no'} label="Pool" />
              {l.hot_tub === 'yes' && <AmenityChip yes label="Hot tub" />}
              <AmenityChip yes={l.parking === 'yes'} no={l.parking === 'no'} label="Parking" />
              {isFav && <span className="chip-amen chip-fav"><Icon icon={Star} className="ico" /> Superhost</span>}
            </div>

            {l.note && (
              <div className="reviews">
                <Icon icon={Sparkles} className="ico" style={{ color: 'var(--accent-text)', fill: 'none' }} />
                <span className="line-clamp-2">{l.note}</span>
              </div>
            )}

            {/* review peek — a real guest quote (separate from the AI note) */}
            {rev?.pos[0]?.text && (
              <div className="reviews" style={{ alignItems: 'flex-start' }}>
                <Icon icon={Quote} className="ico" style={{ color: 'var(--text-muted)' }} />
                <span className="line-clamp-2 italic">“{rev.pos[0].text}”{rev.pos[0].author ? <span className="not-italic" style={{ color: 'var(--text-muted)' }}> — {rev.pos[0].author}</span> : null}</span>
              </div>
            )}

            <div className="compare-line">
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="source-link" onClick={(e) => e.stopPropagation()}>
                {l.check_manual ? 'Check manually' : `View on ${l.source}`} <Icon icon={ExternalLink} className="ico" />
              </a>
              {isOwner && (
                <button className="source-link" onClick={(e) => { e.stopPropagation(); void setDecision(isDecision ? null : l.id); }}>
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
        </div>
      </div>
    </article>
  );
}

function AmenityChip({ yes, no, label }: { yes?: boolean; no?: boolean; label: string }) {
  return (
    <span
      className={cn('chip-amen', yes && 'chip-yes', no && 'chip-no')}
      style={!yes && !no ? { background: 'var(--surface-sunken)', color: 'var(--text-muted)' } : undefined}
    >
      <Icon icon={no ? X : Check} className="ico" /> {label}
    </span>
  );
}

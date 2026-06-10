import { useEffect, useState } from 'react';
import {
  ChevronLeft, Bookmark, Share2, ThumbsUp, ThumbsDown, Star, BadgeCheck, Award,
  Waves, SquareParking, Bath, HelpCircle, X, Sparkles, ExternalLink, MapPin, Scale, Check, Clapperboard, LockOpen, Trash2,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { MapWidget } from '@/components/MapWidget';
import { MobilePhotoCarousel } from '@/components/MobilePhotoCarousel';
import { PhotoLightbox } from '@/components/PhotoLightbox';
import { fmt, tallyVotes } from '@/lib/utils';
import { cn } from '@/lib/cn';

const B_LABEL: Record<string, string> = { under: 'Under budget', marginal: 'Marginal', over: 'Over budget', unknown: 'Price TBD' };

export function MobileDetail() {
  const { detailId, tripId, findListing, closeDetail, user, votes, split, isOwner, final, favoriteIds, reviewsMap, loadReviewsFor, selected, toggleSelect, castVote, toggleFavorite, toggleFinalPick, setDecision, requireSignIn, toast, aiWhy, toursMap, generateTour, deleteListing } = useApp();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const l = detailId ? findListing(detailId) : null;
  useEffect(() => { if (l && user && !reviewsMap[`${l.source}:${l.id}`]) void loadReviewsFor(l); /* eslint-disable-next-line */ }, [detailId, user]);
  if (!l) return null;

  const photos = (l.photos || []).filter(Boolean).slice(0, 12);
  const tally = tallyVotes(votes, l.id, user?.id ?? null);
  const net = tally.up - tally.down;
  const pp = l.est_5n ? fmt(Math.ceil(l.est_5n / Math.max(1, split))) : null;
  const isOff = final.decision?.listing_id === l.id;
  const isMyPick = final.myPick === l.id;
  const isSaved = favoriteIds.has(l.id);
  const rev = reviewsMap[`${l.source}:${l.id}`];
  const tour = toursMap[l.id];
  const tourClip = tour?.status === 'ready' ? tour.clips.find((c) => c.videoUrl) : undefined;
  const dists = l.distances ?? [];

  const amen: { yes?: boolean; no?: boolean; unk?: boolean; icon: typeof Waves; label: string }[] = [
    { yes: l.pool === 'yes', no: l.pool === 'no', unk: !l.pool || l.pool === 'unknown', icon: Waves, label: l.pool === 'no' ? 'No pool' : l.pool === 'yes' ? 'Pool' : 'Pool?' },
    ...(l.parking === 'yes' ? [{ yes: true, icon: SquareParking, label: 'Parking' }] : []),
    ...(l.hot_tub === 'yes' ? [{ yes: true, icon: Bath, label: 'Hot tub' }] : []),
    ...(l.superhost ? [{ yes: true, icon: Award, label: 'Superhost' }] : []),
  ];

  const share = () => { try { navigator.clipboard?.writeText(`${location.origin}/#/t/${tripId || ''}/board?listing=${l.id}`); toast('Link copied.', 'success'); } catch { /**/ } };

  return (
    <div className="gp-mobile">
      <div className="scrim show" onClick={closeDetail} />
      <div className="detail show">
        <div className="d-scroll">
          <div className="d-hero">
            <MobilePhotoCarousel photos={photos} alt={l.name} onPhotoTap={(i) => setLightbox(i)}>
              <div className="bar">
                <button className="gbtn" onClick={(e) => { e.stopPropagation(); closeDetail(); }} aria-label="Back"><Icon icon={ChevronLeft} className="ico" /></button>
                <span className="spacer" />
                <button className={cn('gbtn', isSaved && 'saved')} onClick={(e) => { e.stopPropagation(); if (requireSignIn('save')) void toggleFavorite(l.id); }} aria-label="Save"><Icon icon={Bookmark} className="ico" /></button>
                <button className="gbtn" onClick={(e) => { e.stopPropagation(); share(); }} aria-label="Share"><Icon icon={Share2} className="ico" /></button>
              </div>
              {photos.length > 0 && <span className="d-zoomhint">Tap to zoom</span>}
            </MobilePhotoCarousel>
          </div>
          <div className="d-body">
            <div className="d-badges">
              {isOff ? <span className="badge badge-official"><Icon icon={BadgeCheck} className="ico" /> Official pick</span> : <span className={`badge badge-${l.budget ?? 'unknown'}`}>{B_LABEL[l.budget ?? 'unknown']}</span>}
              {l.superhost && <span className="chip-amen chip-fav"><Icon icon={Award} className="ico" /> Superhost</span>}
            </div>
            <h2>{l.name}</h2>
            <div className="d-meta">
              <span className="tag-source">{l.source}</span>
              {l.area && <span>{l.area.split('·')[0].trim()}</span>}
              <span>·</span>
              <span>{[l.bd != null ? `${l.bd} bd` : null, l.ba != null ? `${l.ba} ba` : null, l.sleeps != null ? `sleeps ${l.sleeps}` : null].filter(Boolean).join(' · ')}</span>
              {l.rating != null && <span className="rev"><Icon icon={Star} className="ico" /> {l.rating}{rev?.total ? ` (${rev.total})` : ''}</span>}
            </div>
            {/* Quick facts — themed at-a-glance grid */}
            <div className="d-facts">
              {[
                { k: 'Bedrooms', v: l.bd != null ? `${l.bd}` : '—' },
                { k: 'Bathrooms', v: l.ba != null ? `${l.ba}` : '—' },
                { k: 'Sleeps', v: l.sleeps != null ? `${l.sleeps}` : '—' },
                { k: 'Rating', v: l.rating != null ? `★ ${l.rating}` : 'New' },
                { k: 'Per person', v: pp || '—' },
                { k: 'From DTLA', v: l.distance_mi != null ? `${l.distance_mi} mi` : '—' },
              ].map((f) => <div className="d-fact" key={f.k}><div className="fk">{f.k}</div><div className="fv tnum">{f.v}</div></div>)}
            </div>
            <div className="d-amen">
              {amen.map((a, i) => <span key={i} className={cn('chip-amen', a.yes && 'chip-yes', a.no && 'chip-no', a.unk && 'chip-unk')}><Icon icon={a.unk ? HelpCircle : a.no ? X : a.icon} className="ico" /> {a.label}</span>)}
            </div>
            {/* Location & map */}
            {(l.lat != null || dists.length > 0 || l.area) && (
              <div style={{ marginTop: 8 }}>
                <div className="d-seclabel"><Icon icon={MapPin} className="ico" /> Location</div>
                <MapWidget l={l} />
              </div>
            )}
            <div className="d-break">
              <div className="brow"><span>5-night est all-in</span><span className="v tnum">{fmt(l.est_5n)}</span></div>
              {l.est_4n != null && <div className="brow"><span>4-night est</span><span className="v tnum">{fmt(l.est_4n)}</span></div>}
              <div className="brow total"><span>Per person (÷{split})</span><span className="v tnum">{pp || 'on inquiry'}</span></div>
            </div>
            {(aiWhy[l.id] || l.note) && <div className="d-why"><div className="h"><Icon icon={Sparkles} className="ico" /> Why Scout ranks it here</div><p>{aiWhy[l.id] || l.note}</p></div>}

            {(l.amenities?.length ?? 0) > 0 && (
              <div style={{ marginTop: 6 }}>
                <div className="d-seclabel">Amenities</div>
                <div className="d-amen">{l.amenities!.slice(0, 14).map((a, i) => <span key={i} className="chip-amen chip-yes"><Icon icon={Check} className="ico" /> {a}</span>)}</div>
              </div>
            )}

            {rev && (rev.pos.length > 0 || rev.neg.length > 0) && (
              <div style={{ marginTop: 8 }}>
                <div className="d-seclabel"><Icon icon={Star} className="ico" style={{ width: 13, height: 13, color: 'var(--star)', fill: 'var(--star)' }} /> Guest reviews{rev.total ? ` · ${rev.total}` : ''}</div>
                {[...rev.pos.slice(0, 2).map((r) => ({ ...r, tone: 'pos' })), ...rev.neg.slice(0, 1).map((r) => ({ ...r, tone: 'neg' }))].map((r, i) => (
                  <div key={i} style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)', background: 'var(--surface-inset)', border: '1px solid var(--border)', borderLeft: `3px solid ${r.tone === 'pos' ? 'var(--under)' : 'var(--over)'}`, borderRadius: 'var(--r-md)', padding: '9px 12px', marginBottom: 8 }}>
                    “{r.text}”{r.author ? <span style={{ color: 'var(--text-muted)' }}> — {r.author}</span> : null}
                  </div>
                ))}
              </div>
            )}
            {/* AI walkthrough tour — parity with the desktop detail modal */}
            {(tourClip || tour?.status === 'generating' || isOwner) && (
              <div style={{ marginTop: 8 }}>
                <div className="d-seclabel"><Icon icon={Clapperboard} className="ico" /> Walkthrough tour</div>
                {tourClip ? (
                  <video controls playsInline preload="metadata" poster={tourClip.photo || undefined} src={tourClip.videoUrl!} style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border)', background: '#000' }} />
                ) : tour?.status === 'generating' ? (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}><Icon icon={Sparkles} className="ico" /> Generating a walkthrough of the best spaces… (~a minute)</p>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => void generateTour(l.id)}><Icon icon={Clapperboard} className="ico" /> Generate walkthrough tour</button>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 2 }}>
              <button className="source-link" onClick={() => { toggleSelect(l.id); toast(selected.has(l.id) ? 'Removed from compare.' : 'Added to compare — pick another and tap Compare.', 'success'); }} style={{ fontSize: 13.5, fontWeight: 600, color: selected.has(l.id) ? 'var(--accent-text)' : 'var(--link)', background: 'none', border: 0, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><Icon icon={Scale} className="ico" /> {selected.has(l.id) ? 'In compare' : 'Add to compare'}</button>
              <a className="source-link" href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--link)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{l.check_manual ? 'Check manually' : `View on ${l.source}`} <Icon icon={ExternalLink} className="ico" /></a>
              {isOwner && l.last_seen == null && (
                <button className="source-link" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--over)', background: 'none', border: 0, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => { if (confirm('Remove this listing for everyone?')) { void deleteListing(l.id, !!l.submitted_by); closeDetail(); } }}>
                  <Icon icon={Trash2} className="ico" /> Remove
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="d-foot">
          <div className="votebar" onClick={(e) => e.stopPropagation()}>
            <button className={cn('vote up', tally.mine === 'up' && 'on')} onClick={() => { if (requireSignIn('vote')) void castVote(l.id, 'up'); }} aria-label="Like"><Icon icon={ThumbsUp} className="ico" /></button>
            <span className={cn('net', net > 0 && 'pos', net < 0 && 'neg', 'tnum')}>{net > 0 ? `+${net}` : net}</span>
            <button className={cn('vote down', tally.mine === 'down' && 'on')} onClick={() => { if (requireSignIn('vote')) void castVote(l.id, 'down'); }} aria-label="Dislike"><Icon icon={ThumbsDown} className="ico" /></button>
          </div>
          {isOwner && !isOff ? (
            <>
              {/* The organizer votes too — star = their personal top choice. */}
              <button
                className={cn('btn', isMyPick ? 'btn-primary' : 'btn-ghost')}
                style={{ flex: '0 0 auto', paddingLeft: 14, paddingRight: 14 }}
                onClick={() => { if (requireSignIn('cast your top choice')) void toggleFinalPick(l.id); }}
                aria-label={isMyPick ? 'Your top choice' : 'Make this your top choice'}
                title="My top choice"
              >
                <Icon icon={Star} className="ico" />
              </button>
              {final.total > 0
                ? <button className="btn btn-primary" onClick={() => void setDecision(l.id)}><Icon icon={BadgeCheck} className="ico" /> Make official</button>
                : <button className="btn btn-ghost" disabled style={{ opacity: 0.55 }} title="Wait for the group to cast top choices first">
                    <Icon icon={BadgeCheck} className="ico" /> Make official
                  </button>}
            </>
          ) : isOwner && isOff ? (
            <button className="btn btn-ghost" onClick={() => void setDecision(null)}><Icon icon={LockOpen} className="ico" /> Unlock the pick</button>
          ) : (
            <button className={cn('btn', isMyPick ? 'btn-primary' : 'btn-ghost')} onClick={() => { if (requireSignIn('cast your top choice')) void toggleFinalPick(l.id); }}><Icon icon={Star} className="ico" /> {isMyPick ? 'Top choice' : 'Make top choice'}</button>
          )}
        </div>
      </div>
      {lightbox != null && photos.length > 0 && <PhotoLightbox photos={photos} start={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

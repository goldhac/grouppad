import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ThumbsUp, ThumbsDown, Star, ExternalLink, MapPin, Plane, FerrisWheel, Link2, X,
  ChevronLeft, ChevronRight, Maximize2, Navigation, Wallet, Users, BedDouble, Bath,
  ListChecks, Sparkles, Waves, SquareParking, Wifi, Utensils, Wind, WashingMachine,
  Award, BadgeCheck, GitCompare, Lock, HelpCircle, Check, Clapperboard,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { SafeImg } from '@/components/ui/SafeImg';
import { cn } from '@/lib/cn';
import { fmt, fmtMins, tallyVotes } from '@/lib/utils';
import type { ListingTour } from '@/types';

const BUDGET_LABEL: Record<string, string> = { under: 'under budget', marginal: 'marginal', over: 'over budget', unknown: 'price TBD' };

function DistIcon({ kind }: { kind?: string }) {
  const I = kind === 'airport' ? Plane : kind === 'attraction' ? FerrisWheel : MapPin;
  return <Icon icon={I} className="ico" />;
}

function TourPlayer({ tour }: { tour: ListingTour }) {
  const clips = tour.clips.filter((c) => c.videoUrl);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [tour.listing_id]);
  if (!clips.length) return null;
  const clip = clips[Math.min(idx, clips.length - 1)];
  return (
    <div className="flex flex-col gap-2">
      <video key={clip.videoUrl!} src={clip.videoUrl!} className="aspect-video w-full rounded-[var(--r-md)] border border-border bg-black" autoPlay muted playsInline controls onEnded={() => setIdx((i) => (i < clips.length - 1 ? i + 1 : i))} />
      {clips.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {clips.map((c, i) => (
            <button key={i} onClick={() => setIdx(i)} className="chip-amen" style={i === idx ? { background: 'var(--accent-tint)', color: 'var(--accent-text)' } : { background: 'var(--surface-sunken)', color: 'var(--text-muted)' }}>{c.feature || `Clip ${i + 1}`}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function DetailModal() {
  const {
    detailId, closeDetail, findListing, trip, split, setSplit,
    user, votes, final, isOwner, selected, castVote, toggleFinalPick, setDecision, toggleSelect, requireSignIn,
    reviewsMap, loadReviewsFor, toursMap, generateTour, toast,
  } = useApp();

  const l = detailId ? findListing(detailId) : undefined;
  const [photoIdx, setPhotoIdx] = useState(0);
  const [refIdx, setRefIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [revLoading, setRevLoading] = useState(false);

  useEffect(() => { setPhotoIdx(0); setRefIdx(0); setLightbox(false); }, [detailId]);
  useEffect(() => {
    if (!l || !user || reviewsMap[`${l.source}:${l.id}`]) return;
    let active = true; setRevLoading(true);
    loadReviewsFor(l).finally(() => { if (active) setRevLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId, l?.id, user?.id]);

  const copyLink = async () => {
    if (!trip || !l) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}/#/t/${trip.id}/board?listing=${encodeURIComponent(l.id)}`); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* ignore */ }
  };
  const onGenTour = async () => {
    if (!l) return;
    try { await generateTour(l.id); toast('Generating the walkthrough — it’ll appear here shortly.', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not start the tour.', 'error'); }
  };

  if (!l) return null;

  const tally = tallyVotes(votes, l.id, user?.id ?? null);
  const net = tally.up - tally.down;
  const isMyPick = final.myPick === l.id;
  const isDecision = final.decision?.listing_id === l.id;
  const isSelected = selected.has(l.id);
  const budget = trip?.budget ?? 7000;
  const photos = (l.photos ?? []).slice(0, 6);
  const ph = photos.length ? photos : [''];
  const i = photoIdx % ph.length;
  const pp = l.est_5n ? Math.ceil(l.est_5n / split) : null;
  const ppOver = l.est_5n != null && l.est_5n > budget;
  const dists = l.distances ?? [];
  const activeRef = dists[refIdx] ?? null;
  const nights = 5;
  const mapPlace = `${activeRef?.label ?? l.area ?? ''} ${trip?.destination ?? 'Los Angeles'}`.trim();
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(mapPlace)}&z=11&output=embed`;

  // price breakdown
  const cleaning = trip?.cleaning_placeholder ?? 350;
  const taxRate = trip?.tax_rate ?? 0.14;
  const base = l.est_5n ? Math.round((l.est_5n - cleaning) / (1 + taxRate)) : 0;
  const taxes = l.est_5n ? Math.round(l.est_5n - cleaning - base) : 0;

  // who's voted
  const voterIds = Object.keys(votes[l.id] ?? {});
  const ups = Object.values(votes[l.id] ?? {}).filter((v) => v === 'up').length;
  const groupSize = Math.max(trip?.adults ?? trip?.memberCount ?? 1, 1);

  const rev = reviewsMap[`${l.source}:${l.id}`];
  const tour = toursMap[l.id];
  const hasTour = tour?.status === 'ready' && tour.clips.some((c) => c.videoUrl);

  const leftBadge = isDecision ? (
    <span className="badge badge-rank"><Icon icon={BadgeCheck} className="ico" /> Official pick</span>
  ) : l.submitted_by ? (
    <span className="badge badge-community"><Icon icon={Users} className="ico" /> community</span>
  ) : l.rank != null && l.rank <= 3 ? (
    <span className="badge badge-rank"><Icon icon={Star} className="ico" /> Rank {l.rank}</span>
  ) : l.rank != null ? (
    <span className="badge badge-rank-soft">Rank {l.rank}</span>
  ) : null;

  const amen: { cls: string; icon: typeof Waves; label: string }[] = [];
  amen.push(l.pool === 'yes' ? { cls: 'chip-yes', icon: Waves, label: 'Pool' } : l.pool === 'no' ? { cls: 'chip-no', icon: X, label: 'No pool' } : { cls: 'chip-unk', icon: HelpCircle, label: 'Pool unknown' });
  amen.push(l.parking === 'yes' ? { cls: 'chip-yes', icon: SquareParking, label: 'Free parking' } : { cls: 'chip-unk', icon: HelpCircle, label: 'Parking?' });
  if (l.hot_tub === 'yes') amen.push({ cls: 'chip-yes', icon: Bath, label: 'Hot tub' });
  for (const a of (l.amenities ?? []).slice(0, 5)) {
    const ic = /wifi/i.test(a) ? Wifi : /kitchen/i.test(a) ? Utensils : /a\/?c|air/i.test(a) ? Wind : /wash|dry/i.test(a) ? WashingMachine : ListChecks;
    amen.push({ cls: 'chip-yes', icon: ic, label: a });
  }
  if (l.superhost) amen.push({ cls: 'chip-fav', icon: Award, label: 'Superhost' });

  const chipStyle = (cls: string) => cls === 'chip-unk' ? { background: 'var(--surface-sunken)', color: 'var(--text-muted)' } : undefined;

  const votebar = (
    <div className="votebar">
      <button className={cn('vote up', tally.mine === 'up' && 'on')} aria-label="Like" onClick={() => void castVote(l.id, 'up')}><Icon icon={ThumbsUp} className="ico" /></button>
      <span className={cn('net', net > 0 && 'pos', net < 0 && 'neg', 'tnum')}>{net > 0 ? `+${net}` : net}</span>
      <button className={cn('vote down', tally.mine === 'down' && 'on')} aria-label="Dislike" onClick={() => void castVote(l.id, 'down')}><Icon icon={ThumbsDown} className="ico" /></button>
    </div>
  );

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && closeDetail()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dx-scrim data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="dx-modalwrap"
          onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}
        >
          <div className="dx-modal">
            <div className="dx-shell">
              <div className={cn('dx', isDecision && 'is-official')}>
                {/* ── Gallery (left) ─────────────────────────────────────── */}
                <div className="dx-gallery">
                  <div className="dx-lead" onClick={() => photos.length && setLightbox(true)}>
                    <SafeImg src={ph[i]} alt={l.name} />
                    <div className="gbadges">{leftBadge}<span className={`badge badge-${l.budget ?? 'unknown'}`}>{BUDGET_LABEL[l.budget ?? 'unknown']}</span></div>
                    {ph.length > 1 && <>
                      <button className="gnav l" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); setPhotoIdx((n) => (n - 1 + ph.length) % ph.length); }}><Icon icon={ChevronLeft} className="ico" /></button>
                      <button className="gnav r" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); setPhotoIdx((n) => (n + 1) % ph.length); }}><Icon icon={ChevronRight} className="ico" /></button>
                    </>}
                    <span className="counter tnum">{i + 1} / {ph.length}</span>
                    {photos.length > 0 && <span className="zoom-hint"><Icon icon={Maximize2} className="ico" /> Tap to expand</span>}
                  </div>
                  {ph.length > 1 && (
                    <div className="dx-thumbs">
                      {ph.map((p, k) => (
                        <button key={k} className={cn('dx-thumb', k === i && 'on')} onClick={() => setPhotoIdx(k)}><img src={p} alt="" onError={(e) => (e.currentTarget.style.opacity = '0')} /></button>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Info (right, scroll) ───────────────────────────────── */}
                <div className="dx-info">
                  <div className="dx-topbar">
                    {isDecision ? <span className="badge badge-official"><Icon icon={BadgeCheck} className="ico" /> Official pick</span> : <span className={`badge badge-${l.budget ?? 'unknown'}`}>{BUDGET_LABEL[l.budget ?? 'unknown']}</span>}
                    <span className="spacer" />
                    <button className="dx-iconbtn" onClick={() => void copyLink()} aria-label="Copy link" title="Copy link"><Icon icon={copied ? Check : Link2} className="ico" /></button>
                    <DialogPrimitive.Close className="dx-iconbtn" aria-label="Close"><Icon icon={X} className="ico" /></DialogPrimitive.Close>
                  </div>

                  <div className="dx-head">
                    <div className="badge-row" style={{ justifyContent: 'flex-start', gap: 8 }}>
                      {leftBadge}
                      {l.superhost && <span className="chip-amen chip-fav"><Icon icon={Award} className="ico" /> Superhost</span>}
                    </div>
                    <DialogPrimitive.Title asChild><h1 className="dx-title">{l.name}</h1></DialogPrimitive.Title>
                    <div className="dx-meta">
                      <span className="tag-source">{l.source}</span>
                      {l.area && <span>{l.area}</span>}
                      {l.rating != null ? <span className="rt"><Icon icon={Star} className="ico" style={{ fill: 'var(--star)', color: 'var(--star)' }} /> {l.rating} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({l.reviews ?? 0})</span></span> : <span>no rating yet</span>}
                    </div>
                  </div>

                  <div className="dx-specs">
                    {l.bd != null && <span className="ds"><Icon icon={BedDouble} className="ico" /> {l.bd} bedrooms</span>}
                    {l.ba != null && <span className="ds"><Icon icon={Bath} className="ico" /> {l.ba} baths</span>}
                    {l.sleeps != null && <span className="ds"><Icon icon={Users} className="ico" /> sleeps {l.sleeps}</span>}
                  </div>

                  {l.note && (
                    <div className="dx-note">
                      <div className="nh"><Icon icon={Sparkles} className="ico" /> Why it ranks here</div>
                      <p>{l.note}</p>
                    </div>
                  )}

                  {dists.length > 0 && (
                    <div>
                      <div className="dx-section-label"><Icon icon={Navigation} className="ico" /> Getting around</div>
                      <div className="dx-dist">
                        {dists.map((d, k) => (
                          <button key={k} className={cn('dx-distrow', k === refIdx && 'on')} onClick={() => setRefIdx(k)}>
                            <span className="dico"><DistIcon kind={d.kind} /></span>
                            <span><span className="dplace">{d.label}</span><span className="dsub"> · drive</span></span>
                            <span className="dval"><span className="mi tnum">{d.mi} mi</span> · <span className="min tnum">{fmtMins(d.min)}</span></span>
                          </button>
                        ))}
                      </div>
                      <div className="dx-map">
                        <iframe key={mapSrc} title="Map" loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={mapSrc} />
                        <span className="map-pin"><Icon icon={MapPin} className="ico" /></span>
                      </div>
                    </div>
                  )}

                  {/* price */}
                  <div>
                    <div className="dx-section-label"><Icon icon={Wallet} className="ico" /> {l.est_5n ? `Price breakdown · ${nights} nights` : 'Price'}</div>
                    {l.est_5n ? (
                      <>
                        <div className="dx-price">
                          <div className="pr sub"><span className="lab">Base rate · {nights} nights</span><span className="v tnum">{fmt(base)}</span></div>
                          <div className="pr sub"><span className="lab">Cleaning fee</span><span className="v tnum">{fmt(cleaning)}</span></div>
                          <div className="pr sub"><span className="lab">Taxes &amp; service</span><span className="v tnum">{fmt(taxes)}</span></div>
                          <div className="pr total"><span className="lab">Est all-in</span><span className="v tnum">{fmt(l.est_5n)}</span></div>
                          {l.displayed_5n != null && <div className="pr sub"><span className="lab">Displayed nightly × {nights}</span><span className="v tnum">{fmt(l.displayed_5n)}</span></div>}
                        </div>
                        <div className={cn('pp-hero', ppOver && 'over')} style={{ marginTop: 12 }}>
                          <div className="pp-top"><span className="pp-lab">Per person</span><span className="pp-split">split <b className="tnum">{split}</b> ways</span></div>
                          <div className="pp-amt">{pp != null ? fmt(pp) : '—'} <small>/ person</small></div>
                          <div className="pp-slider">
                            <span className="lab"><Icon icon={Users} className="ico" /> {groupSize} going</span>
                            <input type="range" min={2} max={30} value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Split between this many people" />
                            <span className="lab tnum">{split}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="dx-price"><div className="pr total"><span className="lab">Price on inquiry<small>Contact the host for a quote</small></span><span className="v">—</span></div></div>
                    )}
                  </div>

                  {/* amenities */}
                  <div>
                    <div className="dx-section-label"><Icon icon={ListChecks} className="ico" /> Amenities</div>
                    <div className="dx-amen">
                      {amen.map((a, k) => <span key={k} className={`chip-amen ${a.cls}`} style={chipStyle(a.cls)}><Icon icon={a.icon} className="ico" /> {a.label}</span>)}
                    </div>
                  </div>

                  {/* who's voted */}
                  <div>
                    <div className="dx-section-label"><Icon icon={Users} className="ico" /> Who’s voted on this home</div>
                    <div className="dx-voters">
                      {voterIds.length > 0 ? (
                        <>
                          <span className="avstack" style={{ display: 'inline-flex' }}>
                            {voterIds.slice(0, 5).map((_, k) => <span key={k} className="av" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-fg)', border: '2px solid var(--surface-raised)', marginLeft: k ? -8 : 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>{String.fromCharCode(65 + k)}</span>)}
                            {voterIds.length > 5 && <span className="av more" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-sunken)', color: 'var(--text-2)', border: '2px solid var(--surface-raised)', marginLeft: -8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>+{voterIds.length - 5}</span>}
                          </span>
                          <span className="vmeta"><b>{voterIds.length} of {groupSize}</b> voted{ups > 0 ? ` · ${ups} liked it` : ''}</span>
                        </>
                      ) : (
                        <span className="vmeta">No votes yet — be the first to weigh in.</span>
                      )}
                    </div>
                  </div>

                  {/* tour */}
                  {(hasTour || tour?.status === 'generating' || (isOwner && !tour)) && (
                    <div>
                      <div className="dx-section-label"><Icon icon={Clapperboard} className="ico" /> Walkthrough tour</div>
                      {hasTour ? <TourPlayer tour={tour!} />
                        : tour?.status === 'generating' ? <p className="text-[13px] text-text-muted"><Icon icon={Sparkles} className="ico animate-pulse" /> Generating a walkthrough of the best spaces… (~a minute)</p>
                        : <button className="btn btn-ghost btn-sm" onClick={() => void onGenTour()}><Icon icon={Clapperboard} className="ico" /> Generate walkthrough tour</button>}
                    </div>
                  )}

                  {/* reviews */}
                  {(rev || revLoading) && (
                    <div>
                      <div className="dx-section-label"><Icon icon={Star} className="ico" /> Guest reviews{rev ? ` · ${rev.total}` : ''}</div>
                      {revLoading && !rev ? <p className="text-[13px] text-text-muted">Loading reviews…</p>
                        : rev && (rev.pos.length || rev.neg.length) ? (
                          <div className="flex flex-col gap-2">
                            {rev.pos[0] && <blockquote className="rounded-[var(--r-md)] border border-border bg-surface-inset p-3 text-[12.5px] italic text-text-2">“{rev.pos[0].text}”{rev.pos[0].author ? <span className="not-italic text-text-muted"> — {rev.pos[0].author}</span> : null}</blockquote>}
                            {rev.neg[0] && <blockquote className="rounded-[var(--r-md)] border border-border bg-surface-inset p-3 text-[12.5px] italic text-text-2">“{rev.neg[0].text}”{rev.neg[0].author ? <span className="not-italic text-text-muted"> — {rev.neg[0].author}</span> : null}</blockquote>}
                          </div>
                        ) : <p className="text-[13px] text-text-muted">No written reviews available.</p>}
                    </div>
                  )}

                  {/* actions */}
                  <div className="dx-actions">
                    <div className="row1">
                      {votebar}
                      <button className="btn btn-ghost btn-sm" onClick={() => { if (requireSignIn('cast your top choice')) void toggleFinalPick(l.id); }} style={isMyPick ? { borderColor: 'var(--star-border)', background: 'var(--star-bg)', color: 'var(--star-strong)' } : undefined}>
                        <Icon icon={Star} className="ico" style={isMyPick ? { fill: 'currentColor' } : undefined} /> {isMyPick ? 'My top choice' : 'Top choice'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleSelect(l.id)} style={isSelected ? { borderColor: 'var(--accent)', background: 'var(--accent-tint)', color: 'var(--accent-text)' } : undefined}>
                        <Icon icon={GitCompare} className="ico" /> {isSelected ? 'Comparing' : 'Compare'}
                      </button>
                      <span className="spacer" />
                    </div>
                    {isOwner && (
                      <div className="dx-make">
                        {isDecision
                          ? <button className="btn btn-ghost" onClick={() => void setDecision(null)}><Icon icon={Lock} className="ico" /> Unlock official pick</button>
                          : <button className="btn btn-primary" onClick={() => void setDecision(l.id)}><Icon icon={BadgeCheck} className="ico" /> Make official pick</button>}
                      </div>
                    )}
                    <div className="links">
                      <a href={l.url} target="_blank" rel="noopener noreferrer"><Icon icon={ExternalLink} className="ico" /> {l.check_manual ? 'Check manually' : `View on ${l.source}`}</a>
                      <button className="muted" onClick={() => void copyLink()}><Icon icon={Link2} className="ico" /> {copied ? 'Copied!' : 'Copy link'}</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* mobile sticky bottom bar */}
              <div className="dx-bottombar">
                {votebar}
                <button className="btn btn-ghost btn-sm" onClick={() => { if (requireSignIn('cast your top choice')) void toggleFinalPick(l.id); }}><Icon icon={Star} className="ico" /> {isMyPick ? 'Picked' : 'Top'}</button>
                {isOwner
                  ? <button className="btn btn-primary btn-sm" onClick={() => void setDecision(isDecision ? null : l.id)}><Icon icon={BadgeCheck} className="ico" /> {isDecision ? 'Unlock' : 'Make official'}</button>
                  : <button className="btn btn-primary btn-sm" onClick={() => toggleSelect(l.id)}><Icon icon={GitCompare} className="ico" /> Compare</button>}
              </div>
            </div>
          </div>

          {/* lightbox (Tap to expand) */}
          {lightbox && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-6" onClick={() => setLightbox(false)}>
              <img src={ph[i]} alt={l.name} className="max-h-full max-w-full rounded-[var(--r-md)] object-contain" />
              <button className="dx-iconbtn" style={{ position: 'absolute', top: 20, right: 20 }} aria-label="Close" onClick={() => setLightbox(false)}><Icon icon={X} className="ico" /></button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

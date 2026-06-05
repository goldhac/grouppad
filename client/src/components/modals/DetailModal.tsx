import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ThumbsUp, ThumbsDown, Star, ExternalLink, MapPin, Plane, FerrisWheel, Lock, Link2,
  Clapperboard, Sparkles, X, Bed, Bath, Users, Navigation, Check,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { SafeImg } from '@/components/ui/SafeImg';
import { cn } from '@/lib/cn';
import { fmt, fmtMins, tallyVotes } from '@/lib/utils';
import type { ReviewSnippet, ListingTour } from '@/types';

type DTab = 'overview' | 'reviews' | 'tour';

function TourPlayer({ tour }: { tour: ListingTour }) {
  const clips = tour.clips.filter((c) => c.videoUrl);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [tour.listing_id]);
  if (!clips.length) return null;
  const clip = clips[Math.min(idx, clips.length - 1)];
  return (
    <div className="flex flex-col gap-2">
      <video
        key={clip.videoUrl!}
        src={clip.videoUrl!}
        className="aspect-video w-full rounded-[var(--r-md)] border border-border bg-black"
        autoPlay muted playsInline controls
        onEnded={() => setIdx((i) => (i < clips.length - 1 ? i + 1 : i))}
      />
      {clips.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {clips.map((c, i) => (
            <button key={i} onClick={() => setIdx(i)} className={cn('chip-amen', i === idx ? 'chip-yes' : '')} style={i !== idx ? { background: 'var(--surface-sunken)', color: 'var(--text-muted)' } : undefined}>
              {c.feature || `Clip ${i + 1}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DistIcon({ kind }: { kind?: string }) {
  const I = kind === 'airport' ? Plane : kind === 'attraction' ? FerrisWheel : MapPin;
  return <Icon icon={I} className="ico" />;
}

function ReviewList({ title, tone, items }: { title: string; tone: 'pos' | 'neg'; items: ReviewSnippet[] }) {
  return (
    <div>
      <div className={cn('mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide', tone === 'pos' ? 'text-accent-text' : 'text-over')}>
        <Icon icon={tone === 'pos' ? ThumbsUp : ThumbsDown} className="ico" /> {title}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-text-muted">—</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((r, i) => (
            <li key={i} className="rounded-[var(--r-md)] border border-border bg-surface-inset p-3 text-[12.5px]">
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-text-muted">
                {r.rating != null && <span className="inline-flex items-center gap-0.5"><Icon icon={Star} className="ico" style={{ fill: 'var(--star)', color: 'var(--star)' }} />{r.rating}</span>}
                {r.author && <span>· {r.author}</span>}
                {r.date && <span className="opacity-70">· {r.date}</span>}
              </div>
              <p className="leading-relaxed text-text-2">{r.text}</p>
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
    reviewsMap, loadReviewsFor, toursMap, generateTour, toast,
  } = useApp();

  const l = detailId ? findListing(detailId) : undefined;
  const [tab, setTab] = useState<DTab>('overview');
  const [tourBusy, setTourBusy] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [refIdx, setRefIdx] = useState(0);
  const [revLoading, setRevLoading] = useState(false);

  useEffect(() => { setPhotoIdx(0); setRefIdx(0); setTab('overview'); }, [detailId]);

  useEffect(() => {
    if (!l || !user || reviewsMap[`${l.source}:${l.id}`]) return;
    let active = true;
    setRevLoading(true);
    loadReviewsFor(l).finally(() => { if (active) setRevLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId, l?.id, user?.id]);

  async function onGenTour() {
    if (!l) return;
    setTourBusy(true);
    try { await generateTour(l.id); toast('Generating the walkthrough — it’ll appear here shortly.', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not start the tour.', 'error'); }
    finally { setTourBusy(false); }
  }

  const copyLink = async () => {
    if (!trip || !l) return;
    const url = `${window.location.origin}/#/t/${trip.id}/board?listing=${encodeURIComponent(l.id)}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* ignore */ }
  };

  if (!l) return null;

  const tally = tallyVotes(votes, l.id, user?.id ?? null);
  const net = tally.up - tally.down;
  const isMyPick = final.myPick === l.id;
  const isDecision = final.decision?.listing_id === l.id;
  const budget = trip?.budget ?? 7000;
  const photos = l.photos ?? [];
  const pp = l.est_5n ? Math.ceil(l.est_5n / split) : null;
  const dists = l.distances ?? [];
  const activeRef = dists[refIdx] ?? null;
  const mapQuery = encodeURIComponent(`${l.area ?? ''} ${trip?.destination ?? 'Los Angeles'}`);
  const mapSrc = activeRef
    ? `https://www.google.com/maps?q=${encodeURIComponent(`${activeRef.label} ${trip?.destination ?? ''}`.trim())}&z=11&output=embed`
    : `https://www.google.com/maps?q=${mapQuery}&z=11&output=embed`;

  const rev = reviewsMap[`${l.source}:${l.id}`];
  const tour = toursMap[l.id];
  const hasTour = tour?.status === 'ready' && tour.clips.some((c) => c.videoUrl);
  const showTourTab = hasTour || tour?.status === 'generating' || (isOwner && !tour);
  const budgetLabel: Record<string, string> = { under: 'under budget', marginal: 'marginal', over: 'over budget', unknown: 'price TBD' };

  const TABS: { key: DTab; label: string; n?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'reviews', label: 'Reviews', n: rev?.total },
    ...(showTourTab ? [{ key: 'tour' as DTab, label: 'Tour' }] : []),
  ];

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && closeDetail()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-scrim backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="detail-modal show"
          onOpenAutoFocus={(e) => e.preventDefault()}
          style={{ display: 'flex' }}
        >
          <div className="sheet-card">
            <div className="detail">
              {/* Photo + top bar */}
              <div className="d-photo">
                <SafeImg src={photos[photoIdx] || ''} alt={l.name} />
                <div className="d-topbar">
                  <span className={`badge badge-${l.budget ?? 'unknown'}`}>{budgetLabel[l.budget ?? 'unknown']}</span>
                  {isDecision && <span className="badge badge-official"><Icon icon={Lock} className="ico" /> Official pick</span>}
                  <span className="spacer" />
                  <button className="d-iconbtn" onClick={() => void copyLink()} title="Copy a shareable link" aria-label="Copy link">
                    <Icon icon={copied ? Check : Link2} className="ico" />
                  </button>
                  <DialogPrimitive.Close className="d-iconbtn" aria-label="Close"><Icon icon={X} className="ico" /></DialogPrimitive.Close>
                </div>
              </div>

              {photos.length > 1 && (
                <div className="d-thumbs">
                  {photos.slice(0, 6).map((p, i) => (
                    <img key={i} src={p} alt="" className={cn('t', i === photoIdx && 'on')} onClick={() => setPhotoIdx(i)} />
                  ))}
                </div>
              )}

              <div className="d-body">
                {/* Persistent header */}
                <div className="badge-row" style={{ justifyContent: 'flex-start', gap: 8 }}>
                  {l.rank != null && l.rank <= 3 && <span className="badge badge-rank"><Icon icon={Star} className="ico" /> Rank {l.rank}</span>}
                  {l.superhost && <span className="badge badge-marginal"><Icon icon={Star} className="ico" /> Superhost</span>}
                </div>
                <DialogPrimitive.Title asChild><h3 className="d-title">{l.name}</h3></DialogPrimitive.Title>
                <div className="d-meta">
                  <span className="tag-source">{l.source}</span>
                  {l.area && <span>{l.area}</span>}
                  {l.rating != null && <span className="inline-flex items-center gap-1"><Icon icon={Star} className="ico" style={{ fill: 'var(--star)', color: 'var(--star)', width: 13, height: 13 }} /> {l.rating} <span className="opacity-70">({l.reviews ?? 0})</span></span>}
                </div>
                <div className="d-dist" style={{ gap: 16, fontSize: 13.5, color: 'var(--text-2)' }}>
                  {l.bd != null && <span className="inline-flex items-center gap-1.5"><Icon icon={Bed} className="ico" /> {l.bd} bd</span>}
                  {l.ba != null && <span className="inline-flex items-center gap-1.5"><Icon icon={Bath} className="ico" /> {l.ba} ba</span>}
                  {l.sleeps != null && <span className="inline-flex items-center gap-1.5"><Icon icon={Users} className="ico" /> sleeps {l.sleeps}</span>}
                </div>

                {/* Tabs */}
                <div className="d-tabs" role="tablist">
                  {TABS.map((t) => (
                    <button key={t.key} role="tab" aria-selected={tab === t.key} className={cn('d-tab', tab === t.key && 'on')} onClick={() => setTab(t.key)}>
                      {t.label}{t.n != null && <span className="pip tnum">{t.n}</span>}
                    </button>
                  ))}
                </div>

                {/* ── Overview ─────────────────────────────────────────────── */}
                {tab === 'overview' && (
                  <>
                    {l.note && (
                      <div className="insights">
                        <div className="ih"><Icon icon={Sparkles} className="ico" /> Why it ranks here</div>
                        <p>{l.note}</p>
                      </div>
                    )}

                    {dists.length > 0 && (
                      <>
                        <div className="d-section-h">Getting around</div>
                        <div className="d-dist">
                          {dists.map((d, i) => (
                            <button key={i} onClick={() => setRefIdx(i)} className={cn('pill-dist', i === refIdx && 'on')} style={i === refIdx ? { borderColor: 'var(--accent)', background: 'var(--accent-tint)' } : undefined}>
                              <DistIcon kind={d.kind} />
                              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{d.label}</span>
                              <span className="sep">·</span>
                              <span className="mi tnum">{d.mi} mi</span>
                              <span className="sep">·</span>
                              <span className="tnum">{fmtMins(d.min)}</span>
                            </button>
                          ))}
                        </div>
                        <div className="d-map">
                          <iframe key={mapSrc} title={activeRef ? `Map · ${activeRef.label}` : 'Area map'} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={mapSrc} style={{ width: '100%', height: '100%', border: 0 }} />
                        </div>
                      </>
                    )}

                    {(l.amenities?.length ?? 0) > 0 && (
                      <div className="amen-row">
                        {l.amenities!.slice(0, 12).map((a) => (
                          <span key={a} className="chip-amen" style={{ background: 'var(--surface-sunken)', color: 'var(--text-2)' }}>{a}</span>
                        ))}
                      </div>
                    )}

                    <div className="breakdown">
                      <div className="brow"><span>5-night est all-in</span><span className="v tnum">{fmt(l.est_5n)}</span></div>
                      {l.displayed_5n != null && <div className="brow"><span>Displayed (5 nights)</span><span className="v tnum">{fmt(l.displayed_5n)}</span></div>}
                      {l.est_4n != null && <div className="brow"><span>4-night est</span><span className="v tnum">{fmt(l.est_4n)}</span></div>}
                      {pp != null && (
                        <div className="brow pp total"><span>Per person · split {split}</span><span className="v tnum" style={l.est_5n != null && l.est_5n > budget ? { color: 'var(--over)' } : undefined}>{fmt(pp)}</span></div>
                      )}
                    </div>
                  </>
                )}

                {/* ── Reviews ──────────────────────────────────────────────── */}
                {tab === 'reviews' && (
                  <div>
                    {revLoading && !rev ? (
                      <p className="text-sm text-text-muted">Loading guest reviews…</p>
                    ) : rev && (rev.pos.length > 0 || rev.neg.length > 0) ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <ReviewList title="Loved it" tone="pos" items={rev.pos} />
                        <ReviewList title="Concerns" tone="neg" items={rev.neg} />
                      </div>
                    ) : !user ? (
                      <p className="text-sm text-text-muted">Sign in to load guest reviews for this home.</p>
                    ) : (
                      <p className="text-sm text-text-muted">No written reviews available for this home.</p>
                    )}
                  </div>
                )}

                {/* ── Tour ─────────────────────────────────────────────────── */}
                {tab === 'tour' && (
                  <div>
                    {hasTour ? (
                      <TourPlayer tour={tour!} />
                    ) : tour?.status === 'generating' ? (
                      <div className="flex items-center gap-2 rounded-[var(--r-md)] border border-border bg-surface-inset p-3 text-sm text-text-muted">
                        <Icon icon={Sparkles} className="ico animate-pulse" style={{ color: 'var(--accent-text)' }} /> Generating a walkthrough of the best spaces… (~a minute)
                      </div>
                    ) : isOwner ? (
                      <button className="btn btn-ghost btn-sm" disabled={tourBusy} onClick={() => void onGenTour()}>
                        <Icon icon={Clapperboard} className="ico" /> {tourBusy ? 'Starting…' : 'Generate walkthrough tour'}
                      </button>
                    ) : null}
                  </div>
                )}

                {/* Persistent actions */}
                <div className="d-actions">
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="source-link">
                    {l.check_manual ? 'Check manually' : `View on ${l.source}`} <Icon icon={ExternalLink} className="ico" />
                  </a>
                  <span className="spacer" />
                  <div className="votebar">
                    <button className={cn('vote up', tally.mine === 'up' && 'on')} aria-label="Like" onClick={() => void castVote(l.id, 'up')}><Icon icon={ThumbsUp} className="ico" /> {tally.up}</button>
                    <span className={cn('net', net > 0 && 'pos', net < 0 && 'neg', 'tnum')}>{net > 0 ? `+${net}` : net}</span>
                    <button className={cn('vote down', tally.mine === 'down' && 'on')} aria-label="Dislike" onClick={() => void castVote(l.id, 'down')}><Icon icon={ThumbsDown} className="ico" /> {tally.down}</button>
                  </div>
                  <button className={cn('btn btn-sm', isMyPick ? 'btn-primary' : 'btn-ghost')} onClick={() => { if (requireSignIn('cast your top choice')) void toggleFinalPick(l.id); }}>
                    <Icon icon={Star} className="ico" style={isMyPick ? { fill: 'currentColor' } : undefined} /> {isMyPick ? 'My pick' : 'Top choice'}
                  </button>
                  {isOwner && (
                    <button className={cn('btn btn-sm', isDecision ? 'btn-primary' : 'btn-ghost')} onClick={() => void setDecision(isDecision ? null : l.id)}>
                      <Icon icon={Navigation} className="ico" /> {isDecision ? 'Unlock' : 'Make official'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

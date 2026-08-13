import { useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ThumbsUp, ThumbsDown, ExternalLink, Star, Clock, RefreshCw, Compass, MapPin, UsersRound, X, ListPlus, Sparkles, CalendarDays, Bookmark, Check, Share2, FileDown } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { Carousel } from '@/components/Carousel';
import { SafeImg } from '@/components/ui/SafeImg';
import { cn } from '@/lib/cn';
import { fmtMins, expAnchor, expDistanceMi } from '@/lib/utils';
import { track } from '@/lib/analytics';
import type { Experience, ExpVotesMap, ListingReviews, ExpPlan, ExpDaysMap } from '@/types';

/** Per-experience tally from the exp-votes store (mirrors the homes tally shape).
 *  Exported for MobileBoard's "Things to do" view. */
export function expTally(votes: ExpVotesMap, id: string, uid: string | null) {
  const v = votes[id] || {};
  let up = 0, down = 0;
  for (const d of Object.values(v)) (d === 'up' ? up++ : down++);
  return { up, down, net: up - down, mine: uid ? v[uid] ?? null : null };
}

/** Where a row came from, for outlink labels and honest empty-price copy. */
export const expSourceLabel = (x: Experience) =>
  x.source === 'osm' ? 'OpenStreetMap' : x.source === 'viator' ? 'Viator' : 'Airbnb';

/** Price line shared by card + modal: discount strikethrough and, for
 *  group-priced experiences, the per-person cost at the trip's split. */
export function ExpPrice({ x, split }: { x: Experience; split: number }) {
  // OSM has no pricing at all, so "see price on Airbnb" would be a lie. Only
  // claim "Free" when the data explicitly said so (fee=no).
  if (x.price === 0) return <span>Free</span>;
  if (x.price == null) return <span>{x.source === 'osm' ? 'Free or ticketed — check the site' : `See price on ${expSourceLabel(x)}`}</span>;
  const unit = x.priceUnit === 'group' ? 'group' : 'guest';
  return (
    <span className="tnum">
      From ${x.price} / {unit}
      {x.originalPrice != null && x.originalPrice > x.price && (
        <> <s style={{ opacity: 0.55 }}>${x.originalPrice}</s></>
      )}
      {unit === 'group' && split > 1 && <> · ~${Math.ceil(x.price / split)} pp</>}
    </span>
  );
}

function ExperienceCard({ x, dist, anchorLabel, onOpen, pinnedDay, saved, onToggleSave, picked, onTogglePick }: { x: Experience; dist?: number | null; anchorLabel?: string; onOpen?: () => void; pinnedDay?: string | null; saved?: boolean; onToggleSave?: () => void; picked?: boolean; onTogglePick?: () => void }) {
  const { user, expVotes, castExpVote, split } = useApp();
  const t = expTally(expVotes, x.id, user?.id ?? null);
  const vote = (dir: 'up' | 'down') => {
    void castExpVote(x.id, dir);
    track('experience_voted', { experience_id: x.id, dir });
  };
  return (
    <article className={cn('card', picked && 'is-selected')} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen?.()}>
      <Carousel photos={x.photo ? [x.photo] : []} alt={x.title}>
        <button
          type="button"
          className={cn('save-btn', saved && 'on')}
          aria-label={saved ? 'Saved to your list' : 'Save to your list'}
          aria-pressed={!!saved}
          onClick={(e) => { e.stopPropagation(); onToggleSave?.(); }}
        >
          <Icon icon={Bookmark} className="ico" />
        </button>
        <button
          type="button"
          className={cn('star-btn', picked && 'on')}
          aria-label={picked ? 'Selected for Scout' : 'Select for Scout to plan'}
          aria-pressed={!!picked}
          onClick={(e) => { e.stopPropagation(); onTogglePick?.(); }}
        >
          <Icon icon={Check} className="ico" />
        </button>
      </Carousel>
      <div className="body">
        <div className="badge-row">
          {x.originalPrice != null && x.price != null && x.originalPrice > x.price && (
            <span className="badge badge-under">Save ${x.originalPrice - x.price}</span>
          )}
          {pinnedDay && <span className="badge badge-under"><Icon icon={CalendarDays} className="ico" /> {dayLabel(pinnedDay).replace(/,.*$/, '')}</span>}
          {x.priceUnit === 'group' && <span className="badge"><Icon icon={UsersRound} className="ico" /> Group rate</span>}
          {x.category && <span className="badge">{x.category}</span>}
          {x.rating != null && (
            <span className="badge"><Icon icon={Star} className="ico" /> {x.rating.toFixed(2)}{x.reviews != null && ` (${x.reviews})`}</span>
          )}
        </div>
        <h3 className="title">{x.title}</h3>
        <div className="specs xspecs">
          <ExpPrice x={x} split={split} />
          {x.duration != null && <span><Icon icon={Clock} className="ico" /> {fmtMins(x.duration)}</span>}
          {dist != null && <span><Icon icon={MapPin} className="ico" /> <span className="tnum">{dist}</span> mi from {anchorLabel}</span>}
        </div>
        <div className="votebar-row" onClick={(e) => e.stopPropagation()}>
          <div className="votebar">
            <button className={cn('vote up', t.mine === 'up' && 'on')} aria-label="Want to do this" onClick={() => vote('up')}>
              <Icon icon={ThumbsUp} className="ico" /> {t.up}
            </button>
            <span className={cn('net', t.net > 0 && 'pos', t.net < 0 && 'neg', 'tnum')}>{t.net > 0 ? `+${t.net}` : t.net}</span>
            <button className={cn('vote down', t.mine === 'down' && 'on')} aria-label="Not for me" onClick={() => vote('down')}>
              <Icon icon={ThumbsDown} className="ico" /> {t.down}
            </button>
          </div>
          <a
            className="btn btn-ghost btn-sm"
            href={x.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('experience_outlink', { experience_id: x.id })}
          >
            Open on {expSourceLabel(x)} <Icon icon={ExternalLink} className="ico" />
          </a>
        </div>
      </div>
    </article>
  );
}

/** Experience detail dialog — same house modal pattern as the rest of the app
 *  (auth.css modal-scrim/modal: centered on desktop, bottom-sheet on mobile).
 *  Exported for MobileBoard's "Things to do" view. */
export function ExperienceModal({ x, dist, anchorLabel, onClose }: { x: Experience; dist?: number | null; anchorLabel?: string; onClose: () => void }) {
  const { user, expVotes, castExpVote, split, tripId, requireSignIn, toast } = useApp();
  const t = expTally(expVotes, x.id, user?.id ?? null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Recent guest reviews — fetched lazily per open (server caches 7 days).
  const [reviews, setReviews] = useState<ListingReviews | null>(null);
  const [revLoading, setRevLoading] = useState(false);
  useEffect(() => {
    if (!tripId) return;
    let dead = false;
    setReviews(null); setRevLoading(true);
    api.expReviews(tripId, x.id)
      .then((r) => { if (!dead) setReviews(r); })
      .catch(() => { /* reviews are a bonus — fail silent */ })
      .finally(() => { if (!dead) setRevLoading(false); });
    return () => { dead = true; };
  }, [tripId, x.id]);
  const snippets = reviews ? [...reviews.pos, ...reviews.neg].slice(0, 4) : [];

  // Phase 4 — pin this activity to a day of the trip. A human pin beats Scout.
  const [days, setDays] = useState<string[]>([]);
  const [dayMap, setDayMap] = useState<ExpDaysMap>({});
  const [daySaving, setDaySaving] = useState(false);
  useEffect(() => {
    if (!tripId) return;
    let dead = false;
    Promise.all([api.tripDays(tripId).catch(() => ({ days: [] })), api.expDays(tripId).catch(() => ({}))])
      .then(([d, m]) => { if (!dead) { setDays(d.days || []); setDayMap(m || {}); } });
    return () => { dead = true; };
  }, [tripId]);
  const pinDay = async (day: string | null) => {
    if (!tripId || daySaving) return;
    if (!requireSignIn('plan a day')) return;
    setDaySaving(true);
    const prev = dayMap;
    const next = { ...dayMap };
    if (day === null) delete next[x.id]; else next[x.id] = day;
    setDayMap(next); // optimistic
    try {
      setDayMap(await api.setExpDay(tripId, x.id, day));
      track('experience_day_pinned', { experience_id: x.id, day });
    } catch (e) {
      setDayMap(prev);
      toast(e instanceof Error ? e.message : 'Could not set the day.', 'error');
    } finally { setDaySaving(false); }
  };
  const myDay = dayMap[x.id] || null;
  return (
    // Portal-rendered like the homes DetailModal. This is NOT optional: the board's
    // .tab-panel runs an animation whose keyframes include `transform`, which makes
    // it the containing block for position:fixed children — an inline modal's
    // `inset: 0` then sizes to the panel, so the scrim shows but the card lands
    // clipped/off-view ("dark screen, no popup"). A portal escapes that entirely.
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dx-scrim" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="dx-modalwrap"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <DialogPrimitive.Title className="sr-only">{x.title}</DialogPrimitive.Title>
          <div className="dx-modal">
            <div className="dx-shell">
              <div className="dx xd2">
                {/* Gallery (left on laptops, on top on phones) */}
                <div className="dx-gallery">
                  <div className="dx-lead">
                    {x.photo ? <SafeImg src={x.photo} alt={x.title} /> : <span />}
                    <div className="gbadges">
                      {x.originalPrice != null && x.price != null && x.originalPrice > x.price && (
                        <span className="badge badge-under">Save ${x.originalPrice - x.price}</span>
                      )}
                      {x.category && <span className="badge">{x.category}</span>}
                    </div>
                  </div>
                </div>

                {/* Info (right, scrolls) */}
                <div className="dx-info">
                  <div className="dx-topbar">
                    {x.priceUnit === 'group' && <span className="badge"><Icon icon={UsersRound} className="ico" /> Group rate</span>}
                    {x.rating != null && <span className="badge"><Icon icon={Star} className="ico" /> {x.rating.toFixed(2)}{x.reviews != null && ` (${x.reviews})`}</span>}
                    <span className="spacer" />
                    <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon icon={X} className="ico" /></button>
                  </div>

                  <h2 className="dx-title">{x.title}</h2>

                  <div className="xd-facts">
                    {x.price != null && (
                      <span>
                        <b className="tnum">${x.price}</b>&nbsp;/&nbsp;{x.priceUnit === 'group' ? 'group' : 'guest'}
                        {x.originalPrice != null && x.originalPrice > x.price && <>&nbsp;<span className="xd-was tnum">${x.originalPrice}</span></>}
                        {x.priceUnit === 'group' && split > 1 && <>&nbsp;· ~${Math.ceil(x.price / split)} pp</>}
                      </span>
                    )}
                    {x.duration != null && <span><Icon icon={Clock} className="ico" /> {fmtMins(x.duration)}</span>}
                    {dist != null && <span><Icon icon={MapPin} className="ico" /> {dist} mi from {anchorLabel}</span>}
                  </div>

                  {days.length > 0 && (
                    <div className="xd-days">
                      <span className="xd-rev-h"><Icon icon={CalendarDays} className="ico" /> {myDay ? 'Planned for' : 'Which day?'}</span>
                      <div className="xd-daychips">
                        {days.map((d) => (
                          <button key={d} className={cn('chip-filter', myDay === d && 'on')} disabled={daySaving}
                            onClick={() => void pinDay(myDay === d ? null : d)}
                            title={myDay === d ? 'Tap to unpin' : `Plan this for ${dayLabel(d)}`}>
                            {dayLabel(d).replace(/,.*$/, '')}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {revLoading && <p className="xd-quote">Loading recent reviews…</p>}
                  {!revLoading && snippets.length > 0 && (
                    <div className="xd-rev">
                      <span className="xd-rev-h">
                        <Icon icon={Star} className="ico" />
                        {reviews?.summary?.ratingAverage != null
                          ? <>{reviews.summary.ratingAverage} · {reviews.summary.ratingCount?.toLocaleString()} reviews · what guests say</>
                          : <>What guests say</>}
                      </span>
                      {snippets.map((r, i) => (
                        <blockquote key={i} className="xd-quote">
                          &ldquo;{r.text}&rdquo; <span className="who">— {r.author}{r.date ? `, ${r.date}` : ''}</span>
                        </blockquote>
                      ))}
                    </div>
                  )}

                  <div className="xd-actions">
                    <div className="votebar">
                      <button className={cn('vote up', t.mine === 'up' && 'on')} aria-label="Want to do this" onClick={() => { void castExpVote(x.id, 'up'); track('experience_voted', { experience_id: x.id, dir: 'up', surface: 'modal' }); }}>
                        <Icon icon={ThumbsUp} className="ico" /> {t.up}
                      </button>
                      <span className={cn('net', t.net > 0 && 'pos', t.net < 0 && 'neg', 'tnum')}>{t.net > 0 ? `+${t.net}` : t.net}</span>
                      <button className={cn('vote down', t.mine === 'down' && 'on')} aria-label="Not for me" onClick={() => { void castExpVote(x.id, 'down'); track('experience_voted', { experience_id: x.id, dir: 'down', surface: 'modal' }); }}>
                        <Icon icon={ThumbsDown} className="ico" /> {t.down}
                      </button>
                    </div>
                    <a className="btn btn-primary btn-sm" href={x.url} target="_blank" rel="noopener noreferrer" onClick={() => track('experience_outlink', { experience_id: x.id, surface: 'modal' })}>
                      Open on {expSourceLabel(x)} <Icon icon={ExternalLink} className="ico" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The group's list — experiences the group net-likes (the shortlist analog).
 *  Derived purely from votes; no extra store, no extra tab. */
export function expGroupList(experiences: Experience[], expVotes: ExpVotesMap, uid: string | null) {
  return experiences
    .filter((x) => expTally(expVotes, x.id, uid).net >= 1)
    .sort((a, b) => (expTally(expVotes, b.id, uid).net - expTally(expVotes, a.id, uid).net) || ((b.rating ?? 0) - (a.rating ?? 0)))
    .slice(0, 10);
}

/** One itinerary block from the group's list (idempotent-ish: caller appends). */
export function expListToItinerary(list: Experience[]): string {
  const lines = list.map((x) => {
    const bits = [x.price != null ? `$${x.price}/${x.priceUnit === 'group' ? 'group' : 'guest'}` : null, x.duration != null ? fmtMins(x.duration) : null].filter(Boolean).join(' · ');
    return `• ${x.title}${bits ? ` — ${bits}` : ''}`;
  });
  return `\n\nThings to do — group's list (from votes):\n${lines.join('\n')}`;
}

/** Phase 4 — vibe chips. Airbnb's raw categories are long-tail ("Water sports",
 *  "Landmarks", "Food tours"…), so we fold them into a handful of vibes the
 *  group actually thinks in. Matching is on the category + title text. */
export const EXP_VIBES: { key: string; label: string; re: RegExp }[] = [
  { key: 'food', label: 'Food & drink', re: /food|drink|wine|beer|brew|cocktail|tast|dining|restaurant|culinary|cook|coffee|dessert/i },
  { key: 'outdoors', label: 'Outdoors', re: /outdoor|hike|hiking|nature|park|trail|beach|surf|kayak|bike|cycl|horse|climb|garden|canyon/i },
  { key: 'water', label: 'On the water', re: /water|boat|sail|yacht|cruise|kayak|paddle|surf|dive|snorkel|fish/i },
  { key: 'culture', label: 'Culture & sights', re: /art|museum|history|histor|landmark|tour|architect|culture|gallery|sightsee|observator|studio/i },
  { key: 'nightlife', label: 'Nightlife', re: /night|bar|club|party|music|live|comedy|show|karaoke|speakeas/i },
  { key: 'wellness', label: 'Wellness', re: /spa|yoga|massage|wellness|medit|sound bath|fitness|pilates/i },
];
export const expMatchesVibe = (x: Experience, key: string) => {
  const v = EXP_VIBES.find((z) => z.key === key);
  return !!v && v.re.test(`${x.category || ''} ${x.title || ''}`);
};

const dayLabel = (d: string | null) => {
  if (!d) return 'Any day';
  try { return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  catch { return d; }
};

/** Scout's day-by-day plan → an itinerary block a human chooses to save. */
export function expPlanToItinerary(plan: ExpPlan, byId: Map<string, Experience>, pins: ExpDaysMap = {}): string {
  // A human pin always beats Scout's suggested day: re-home any pinned item onto
  // the day the group chose, then drop days that end up empty.
  const pinned = new Set(Object.keys(pins).filter((id) => byId.has(id)));
  const days = plan.days.map((d) => ({ day: d.day, items: d.items.filter((it) => !pinned.has(it.id) || pins[it.id] === d.day) }));
  for (const id of pinned) {
    if (days.some((d) => d.items.some((it) => it.id === id))) continue;
    const target = days.find((d) => d.day === pins[id]);
    if (target) target.items.push({ id, why: 'planned by the group' });
    else days.push({ day: pins[id], items: [{ id, why: 'planned by the group' }] });
  }
  const blocks = days.filter((d) => d.items.length).sort((a, b) => String(a.day).localeCompare(String(b.day))).map((d) => {
    const lines = d.items.map((it) => {
      const x = byId.get(it.id);
      if (!x) return null;
      const bits = [x.price != null ? `$${x.price}/${x.priceUnit === 'group' ? 'group' : 'guest'}` : null, x.duration != null ? fmtMins(x.duration) : null].filter(Boolean).join(' · ');
      return `  • ${x.title}${bits ? ` — ${bits}` : ''}${it.why ? ` (${it.why})` : ''}`;
    }).filter(Boolean);
    return `${dayLabel(d.day)}:\n${lines.join('\n')}`;
  });
  return `\n\nThings to do — Scout's plan (from the group's votes):\n${blocks.join('\n')}`;
}

/** Per-person cost of everything in the plan (Phase 3.3). Group-priced items
 *  divide by the split; per-guest items are already per person. */
export function expPlanPerPerson(plan: ExpPlan, byId: Map<string, Experience>, split: number) {
  let pp = 0; let counted = 0; let missing = 0;
  for (const d of plan.days) for (const it of d.items) {
    const x = byId.get(it.id);
    if (!x || x.price == null) { missing++; continue; }
    pp += x.priceUnit === 'group' ? x.price / Math.max(1, split) : x.price;
    counted++;
  }
  return { perPerson: Math.ceil(pp), counted, missing };
}

/** "Things to do" board tab — scraped Airbnb Experiences the group can vote on.
 *  Spec: docs/specs/experiences.md. Votes surface a "group's list" at the top
 *  (the homes-shortlist analog) which the organizer can send to the itinerary. */
export function ExperiencesSection() {
  const { trip, tripId, experiences, expPending, expVotes, user, refreshExperiences, final, findListing, isOwner, itinerary, saveItinerary, toast, split, requireSignIn } = useApp();
  const [nearest, setNearest] = useState(false);
  const [openX, setOpenX] = useState<Experience | null>(null);
  const [vibe, setVibe] = useState<string | null>(null); // Phase 4 vibe filter
  const [dayPins, setDayPins] = useState<ExpDaysMap>({});   // Phase 4 assign-to-day
  // ── Personal lane: my saved experiences, my selection, my own plan ──────────
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [myPlan, setMyPlan] = useState<ExpPlan | null>(null);
  const [myPlanning, setMyPlanning] = useState(false);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  useEffect(() => {
    if (!tripId || !user) return;
    let dead = false;
    api.expSaves(tripId).then((r) => { if (!dead) setSaved(new Set(r.ids)); }).catch(() => {});
    api.myPlan(tripId).then((p) => { if (!dead) setMyPlan(p); }).catch(() => {});
    return () => { dead = true; };
  }, [tripId, user]);
  const toggleSave = async (id: string) => {
    if (!tripId || !requireSignIn('save this')) return;
    const prev = new Set(saved);
    const next = new Set(saved);
    next.has(id) ? next.delete(id) : next.add(id);
    setSaved(next); // optimistic
    try {
      const r = await api.toggleExpSave(tripId, id, next.has(id));
      setSaved(new Set(r.ids));
      track('experience_saved', { experience_id: id, on: next.has(id) });
    } catch (e) {
      setSaved(prev);
      toast(e instanceof Error ? e.message : 'Could not save that.', 'error');
    }
  };
  const buildMyPlan = async () => {
    if (!tripId || myPlanning) return;
    if (!requireSignIn('plan your days')) return;
    const ids = picked.size ? [...picked] : [...saved];
    if (!ids.length) { toast('Save or select a few things first.', 'error'); return; }
    setMyPlanning(true);
    try {
      const p = await api.buildMyPlan(tripId, ids);
      setMyPlan(p);
      track('my_plan_built', { count: ids.length, fallback: !!p.fallback });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Scout could not plan that.', 'error');
    } finally { setMyPlanning(false); }
  };
  const shareMyPlan = async () => {
    if (!tripId || !user) return;
    const url = `${window.location.origin}/s/plan/${encodeURIComponent(tripId)}/${encodeURIComponent(user.id)}`;
    try {
      if (navigator.share) await navigator.share({ title: 'My plan', url });
      else { await navigator.clipboard.writeText(url); toast('Link copied — paste it in the group chat.', 'success'); }
      track('my_plan_shared');
    } catch { /* user dismissed the share sheet */ }
  };
  useEffect(() => {
    if (!tripId) return;
    let dead = false;
    api.expDays(tripId).then((m) => { if (!dead) setDayPins(m || {}); }).catch(() => {});
    return () => { dead = true; };
  }, [tripId, openX]); // re-read when the dialog closes (a pin may have changed)

  // One viewed event per trip per mount-session (the Phase-3 gating signal).
  const viewedFor = useRef<string | null>(null);
  useEffect(() => {
    if (trip && viewedFor.current !== trip.id) {
      viewedFor.current = trip.id;
      track('experiences_viewed', { trip_id: trip.id, count: experiences.length });
    }
  }, [trip, experiences.length]);

  // "Near your pick" (Phase 2.2): once the decision is locked, anchor distances
  // on the chosen home — its own coords when scraped, else the trip's primary
  // ref point (labeled honestly). No decision / no anchor → no distance UI.
  const anchor = useMemo(() => {
    if (!final.decision) return null;
    return expAnchor(findListing(final.decision.listing_id), trip);
  }, [final.decision, findListing, trip]);
  const distOf = useMemo(() => {
    const m = new Map<string, number | null>();
    if (anchor) for (const x of experiences) m.set(x.id, expDistanceMi(anchor, x));
    return m;
  }, [anchor, experiences]);

  // Most-wanted first, then best-rated, then cheapest — or nearest-first when
  // the toggle is on (experiences without coords sink to the end).
  const sorted = useMemo(() => {
    const uid = user?.id ?? null;
    let pool = vibe ? experiences.filter((x) => expMatchesVibe(x, vibe)) : experiences;
    if (showSavedOnly) pool = pool.filter((x) => saved.has(x.id));
    if (nearest && anchor) {
      return [...pool].sort((a, b) =>
        ((distOf.get(a.id) ?? Infinity) - (distOf.get(b.id) ?? Infinity)) ||
        ((b.rating ?? 0) - (a.rating ?? 0)),
      );
    }
    return [...pool].sort((a, b) =>
      (expTally(expVotes, b.id, uid).net - expTally(expVotes, a.id, uid).net) ||
      ((b.rating ?? 0) - (a.rating ?? 0)) ||
      ((a.price ?? Infinity) - (b.price ?? Infinity)),
    );
  }, [experiences, expVotes, user?.id, nearest, anchor, distOf, vibe, showSavedOnly, saved]);

  // Only offer vibes that actually match something in this trip's list.
  const vibesAvailable = useMemo(
    () => EXP_VIBES.map((v) => ({ ...v, n: experiences.filter((x) => expMatchesVibe(x, v.key)).length })).filter((v) => v.n >= 2),
    [experiences],
  );

  // What the group actually wants: net-liked experiences, best first. This is the
  // "where votes go" answer — a compact strip, not a second grid, so the tab
  // stays one scannable surface instead of duplicating every card twice.
  const groupList = useMemo(
    () => expGroupList(experiences, expVotes, user?.id ?? null),
    [experiences, expVotes, user?.id],
  );
  // Bars are relative to the current leader, so the whole board rescales live.
  const topNet = Math.max(1, ...groupList.map((x) => expTally(expVotes, x.id, user?.id ?? null).net));
  const [sending, setSending] = useState(false);
  const sendToItinerary = async () => {
    if (!groupList.length || sending) return;
    setSending(true);
    try {
      await saveItinerary(`${itinerary.text || ''}${expListToItinerary(groupList)}`.trim());
      toast('Added to the trip plan — see Discussion → Trip plan.', 'success');
      track('experiences_sent_to_itinerary', { count: groupList.length });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update the plan.', 'error');
    } finally { setSending(false); }
  };

  // ── Scout · Plan (docs/specs/scout.md §2) — deliberate, never automatic ──
  const byId = useMemo(() => new Map(experiences.map((x) => [x.id, x])), [experiences]);
  const [plan, setPlan] = useState<ExpPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  useEffect(() => {
    if (!tripId) return;
    let dead = false;
    api.expPlan(tripId).then((p) => { if (!dead) setPlan(p); }).catch(() => {});
    return () => { dead = true; };
  }, [tripId]);
  const runPlan = async (force = false) => {
    if (!tripId || planning) return;
    setPlanning(true);
    try {
      const p = await api.planExperiences(tripId, force);
      setPlan(p);
      track('experiences_planned', { days: p.days.length, fallback: !!p.fallback });
      if (p.fallback) toast('Scout is resting — grouped your picks by votes instead.', 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Scout could not plan right now.', 'error');
    } finally { setPlanning(false); }
  };
  const savePlan = async () => {
    if (!plan || sending) return;
    setSending(true);
    try {
      await saveItinerary(`${itinerary.text || ''}${expPlanToItinerary(plan, byId, dayPins)}`.trim());
      toast('Scout’s plan added to the trip plan.', 'success');
      track('experiences_plan_saved', { days: plan.days.length });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update the plan.', 'error');
    } finally { setSending(false); }
  };
  const planCost = plan ? expPlanPerPerson(plan, byId, split) : null;

  if (experiences.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Icon icon={Compass} className="ico" />
        {expPending ? (
          <p className="text-text-muted">Finding things to do near {trip?.destination || 'your destination'}&hellip; check back in a minute.</p>
        ) : (
          <>
            <p className="text-text-muted">No things to do found for this trip yet.</p>
            <button className="btn btn-primary btn-sm" onClick={() => void refreshExperiences()}>
              <Icon icon={RefreshCw} className="ico" /> Look for things to do
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <section>
      <div className="row-head">
        <span className="ttl">Things to do</span>
        <span className="cnt tnum">{sorted.length}</span>
        <span className="sub">near {trip?.destination} · vote for what you&rsquo;d actually do — booking happens on Airbnb</span>
        <div className="rh-right">
          {anchor && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setNearest((n) => !n)}
              title={`Sort by distance from ${anchor.label}`}
              style={nearest ? { borderColor: 'var(--accent)', background: 'var(--accent-tint)', color: 'var(--accent-text)' } : undefined}
            >
              <Icon icon={MapPin} className="ico" /> Nearest
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => void refreshExperiences()} title="Refresh the list">
            <Icon icon={RefreshCw} className="ico" /> Refresh
          </button>
        </div>
      </div>
      {/* Where the votes go: a live leaderboard. Rows are ordered by net likes and
          reorder themselves as votes land (optimistic locally, ~8s for everyone
          else's), so the group watches the ranking move. Same .leaderboard/.lb-bar
          pattern as the homes top-choice board — one familiar surface, no new tab. */}
      {groupList.length === 0 ? (
        // Nobody's voted yet: teach the mechanic rather than hiding it, so the
        // first visitor knows their 👍 does something.
        <div className="xlb" style={{ marginBottom: 14 }}>
          <div className="xlb-head">
            <span className="xlb-title">Top of the list</span>
            <span className="xlb-sub">nothing ranked yet</span>
          </div>
          <p className="text-sm text-text-muted" style={{ margin: '8px 0 0' }}>
            Hit <Icon icon={ThumbsUp} className="ico inline align-text-bottom" /> on anything below and it climbs this
            list — the group&rsquo;s favourites rise to the top as everyone votes.
          </p>
        </div>
      ) : (
        <div className="xlb" style={{ marginBottom: 14 }}>
          <div className="xlb-head">
            <span className="xlb-title">Top of the list</span>
            <span className="xlb-sub">{groupList.length} in the running · ranked by group likes</span>
          </div>
          <ol className="xlb-rows">
            {groupList.map((x, i) => {
              const tl = expTally(expVotes, x.id, user?.id ?? null);
              const meta = [
                x.price != null ? `$${x.price}/${x.priceUnit === 'group' ? 'group' : 'guest'}` : null,
                x.duration != null ? fmtMins(x.duration) : null,
                dayPins[x.id] ? dayLabel(dayPins[x.id]).replace(/,.*$/, '') : null,
              ].filter(Boolean).join(' · ');
              return (
                <li key={x.id}>
                  <button
                    className={cn('xlb-row', i === 0 && 'lead')}
                    style={{ ['--pct' as string]: `${Math.round((tl.net / topNet) * 100)}%` }}
                    onClick={() => { setOpenX(x); track('experience_detail_opened', { experience_id: x.id, surface: 'leaderboard' }); }}
                  >
                    <span className="xlb-rk">{i + 1}</span>
                    {x.photo
                      ? <img className="xlb-thumb" src={x.photo} alt="" loading="lazy" />
                      : <span className="xlb-thumb" />}
                    <span className="xlb-main">
                      <span className="xlb-name">{x.title}{tl.mine === 'up' && <span style={{ color: 'var(--accent-text)', fontWeight: 600 }}> · you liked</span>}</span>
                      {meta && <span className="xlb-meta">{meta}</span>}
                    </span>
                    <span className="xlb-likes">{tl.net} <small>like{tl.net === 1 ? '' : 's'}</small></span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="xlb-actions">
            <button className="btn btn-sm" onClick={() => void runPlan(!!plan)} disabled={planning}>
              <Icon icon={Sparkles} className="ico" /> {planning ? 'Scout is planning…' : plan ? 'Re-plan' : 'Scout: plan our days'}
            </button>
            {isOwner && (
              <button className="btn btn-ghost btn-sm" onClick={() => void sendToItinerary()} disabled={sending}>
                <Icon icon={ListPlus} className="ico" /> Add list to trip plan
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scout's day-by-day plan — attributed, and only saved to the trip plan
          when a human presses the button (scout.md: Scout never mutates state). */}
      {plan && plan.days.length > 0 && (
        <div className="ai-card" style={{ marginBottom: 14 }}>
          <div className="ah">
            <div className="sp"><Icon icon={Sparkles} className="ico" /></div>
            <div>
              <div className="at">Scout&rsquo;s plan{plan.fallback ? ' · by votes' : ''}</div>
              <div className="as">
                {plan.days.length} day{plan.days.length === 1 ? '' : 's'} from the group&rsquo;s votes
                {planCost && planCost.counted > 0 && <> · ~<b className="tnum">${planCost.perPerson}</b>/person for everything{planCost.missing > 0 && ` (+${planCost.missing} unpriced)`}</>}
              </div>
            </div>
            {isOwner && (
              <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => void savePlan()} disabled={sending}>
                <Icon icon={ListPlus} className="ico" /> {sending ? 'Adding…' : 'Add to trip plan'}
              </button>
            )}
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {plan.days.map((d, i) => (
              <div key={i}>
                <div className="lb-sub" style={{ fontWeight: 700 }}>{dayLabel(d.day)}</div>
                {d.items.map((it) => {
                  const x = byId.get(it.id);
                  if (!x) return null;
                  return (
                    <div key={it.id} className="specs" style={{ marginTop: 2 }}>
                      <button
                        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}
                        onClick={() => { setOpenX(x); track('experience_detail_opened', { experience_id: x.id, surface: 'scout_plan' }); }}
                      >
                        <b>{x.title}</b>
                        {x.duration != null && <> · {fmtMins(x.duration)}</>}
                        {x.price != null && <> · ${x.price}/{x.priceUnit === 'group' ? 'group' : 'guest'}</>}
                        {it.why && <span style={{ opacity: 0.7 }}> — {it.why}</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── My plan (personal lane) ─────────────────────────────────────────
          Your own saved picks, planned by Scout just for you, shareable as a
          link so you can drop "this is my plan" into the group chat. */}
      {user && (saved.size > 0 || picked.size > 0 || myPlan) && (
        <div className="ai-card" style={{ marginBottom: 14 }}>
          <div className="ah">
            <div className="sp"><Icon icon={Bookmark} className="ico" /></div>
            <div>
              <div className="at">My plan{myPlan?.fallback ? ' · by picks' : ''}</div>
              <div className="as">
                {picked.size > 0
                  ? `${picked.size} selected — Scout will plan exactly these`
                  : myPlan
                    ? `${myPlan.days.reduce((n, d) => n + d.items.length, 0)} activities over ${myPlan.days.length} day${myPlan.days.length === 1 ? '' : 's'} · private to you`
                    : `${saved.size} saved · private to you`}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={() => void buildMyPlan()} disabled={myPlanning}>
                <Icon icon={Sparkles} className="ico" /> {myPlanning ? 'Planning…' : myPlan ? 'Re-plan mine' : 'Plan my days'}
              </button>
              {myPlan && (
                <a
                  className="btn btn-ghost btn-sm"
                  href={tripId && user ? `/s/plan/${encodeURIComponent(tripId)}/${encodeURIComponent(user.id)}.pdf` : '#'}
                  onClick={() => track('my_plan_pdf')}
                  title="Download a printable PDF of your plan"
                >
                  <Icon icon={FileDown} className="ico" /> PDF
                </a>
              )}
              {myPlan && (
                <button className="btn btn-primary btn-sm" onClick={() => void shareMyPlan()}>
                  <Icon icon={Share2} className="ico" /> Share my plan
                </button>
              )}
            </div>
          </div>
          {myPlan && myPlan.days.length > 0 && (
            <div className="xplan">
              {myPlan.days.map((d, di) => (
                <div className="xplan-day" key={di} style={{ animationDelay: `${di * 70}ms` }}>
                  <div className="xplan-dh">{dayLabel(d.day)}</div>
                  {d.items.map((it) => {
                    const x = byId.get(it.id);
                    if (!x) return null;
                    return (
                      <button key={it.id} className="xplan-it" onClick={() => { setOpenX(x); track('experience_detail_opened', { experience_id: x.id, surface: 'my_plan' }); }}>
                        {x.photo ? <img src={x.photo} alt="" loading="lazy" /> : <span className="ph" />}
                        <span className="tx">
                          <b>{x.title}</b>
                          <small>{[x.price != null ? `$${x.price}/${x.priceUnit === 'group' ? 'group' : 'guest'}` : null, x.duration != null ? fmtMins(x.duration) : null].filter(Boolean).join(' · ')}{it.why ? ` — ${it.why}` : ''}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Vibe chips (Phase 4) — one row, only vibes present in this trip's list. */}
      {vibesAvailable.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 0 12px' }}>
          <button className={cn('chip-filter', !vibe && 'on')} onClick={() => setVibe(null)}>All {experiences.length}</button>
          {user && saved.size > 0 && (
            <button className={cn('chip-filter', showSavedOnly && 'on')} onClick={() => setShowSavedOnly((v) => !v)}>
              <Icon icon={Bookmark} className="ico" /> Saved <span className="tnum" style={{ opacity: 0.6 }}>{saved.size}</span>
            </button>
          )}
          {vibesAvailable.map((v) => (
            <button
              key={v.key}
              className={cn('chip-filter', vibe === v.key && 'on')}
              onClick={() => { const next = vibe === v.key ? null : v.key; setVibe(next); if (next) track('experiences_vibe_filtered', { vibe: next }); }}
            >
              {v.label} <span className="tnum" style={{ opacity: 0.6 }}>{v.n}</span>
            </button>
          ))}
        </div>
      )}

      {sorted.length === 0 && vibe && (
        <p className="text-text-muted" style={{ margin: '0 0 12px' }}>
          Nothing in that vibe yet. <button className="btn btn-ghost btn-sm" onClick={() => setVibe(null)}>Show all</button>
        </p>
      )}

      <div className="b-grid">
        {sorted.map((x) => (
          <ExperienceCard
            key={x.id}
            x={x}
            dist={distOf.get(x.id) ?? null}
            anchorLabel={anchor?.label}
            pinnedDay={dayPins[x.id] || null}
            saved={saved.has(x.id)}
            onToggleSave={() => void toggleSave(x.id)}
            picked={picked.has(x.id)}
            onTogglePick={() => setPicked((s0) => { const n = new Set(s0); n.has(x.id) ? n.delete(x.id) : n.add(x.id); return n; })}
            onOpen={() => { setOpenX(x); track('experience_detail_opened', { experience_id: x.id }); }}
          />
        ))}
      </div>
      {openX && (
        <ExperienceModal x={openX} dist={distOf.get(openX.id) ?? null} anchorLabel={anchor?.label} onClose={() => setOpenX(null)} />
      )}
    </section>
  );
}

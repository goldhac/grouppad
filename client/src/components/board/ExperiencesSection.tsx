import { useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowRight, ChevronRight, Home, ThumbsUp, ThumbsDown, ExternalLink, Star, Clock, RefreshCw, Compass, MapPin, UsersRound, X, ListPlus, Sparkles, CalendarDays, Bookmark, Check, Share2, FileDown, Tag, Trophy, Users, Lock, Flag, CornerDownRight, Car, Footprints, CloudOff, FilterX } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { Carousel } from '@/components/Carousel';
import { SafeImg } from '@/components/ui/SafeImg';
import { cn } from '@/lib/cn';
import { fmtMins, expAnchor, expDistanceMi } from '@/lib/utils';
import { track } from '@/lib/analytics';
import type { Experience, ExpVotesMap, ListingReviews, ExpPlan, ExpDaysMap, DayRoute, RouteRow } from '@/types';

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

/**
 * The experience card — redesign variant A ("Quiet"), plus variant C's
 * denominator. It is on screen ~40 times per board, so every gram counts.
 *
 * What changed and why (Claude Design handoff, §01):
 *  · The photo used to carry FIVE badges in a `space-between` row that could
 *    not wrap, so at four columns they clipped mid-word. Now exactly ONE
 *    urgency badge earns the photo; category, rating, duration and distance
 *    became type instead of chips.
 *  · Two near-identical 34px circles (save + select) sat on the photo and the
 *    selected state was nearly invisible. Save is now the only overlay, and
 *    selecting for Scout is a MODE the My-plan panel turns on — so selection
 *    can be unmistakable (ring + tint + filled box).
 *  · A human pinning a day outranks metadata, so it gets its own marker rather
 *    than becoming a fifth chip competing with the rating.
 */
function ExperienceCard({ x, dist, anchorLabel, onOpen, pinnedDay, saved, onToggleSave, picked, onTogglePick, pickMode }: { x: Experience; dist?: number | null; anchorLabel?: string; onOpen?: () => void; pinnedDay?: string | null; saved?: boolean; onToggleSave?: () => void; picked?: boolean; onTogglePick?: () => void; pickMode?: boolean }) {
  const { user, expVotes, castExpVote, split } = useApp();
  const t = expTally(expVotes, x.id, user?.id ?? null);
  const vote = (dir: 'up' | 'down') => {
    void castExpVote(x.id, dir);
    track('experience_voted', { experience_id: x.id, dir });
  };
  const discount = x.originalPrice != null && x.price != null && x.originalPrice > x.price
    ? x.originalPrice - x.price : null;
  // Metadata as one muted line, in the order a group actually reads it.
  const meta = [
    x.category,
    x.duration != null ? fmtMins(x.duration) : null,
    dist != null ? `${dist} mi from ${anchorLabel}` : null,
  ].filter(Boolean) as string[];

  return (
    <article
      className={cn('card', 'xc', pickMode && 'pickmode', picked && 'picked')}
      role="button"
      tabIndex={0}
      onClick={() => (pickMode ? onTogglePick?.() : onOpen?.())}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (pickMode ? onTogglePick?.() : onOpen?.())}
    >
      <Carousel photos={x.photo ? [x.photo] : []} alt={x.title}>
        {/* The one badge allowed on the photo: urgency only, never metadata. */}
        {discount != null ? (
          <span className="xrib save"><Icon icon={Tag} className="ico" /> Save ${discount}</span>
        ) : x.priceUnit === 'group' ? (
          <span className="xrib group"><Icon icon={UsersRound} className="ico" /> Group rate</span>
        ) : null}
        <button
          type="button"
          className={cn('save-btn', saved && 'on')}
          aria-label={saved ? 'Saved to your list' : 'Save to your list'}
          aria-pressed={!!saved}
          onClick={(e) => { e.stopPropagation(); onToggleSave?.(); }}
        >
          <Icon icon={Bookmark} className="ico" />
        </button>
        {pickMode && (
          <span className="pickbox" aria-hidden="true"><Icon icon={Check} className="ico" /></span>
        )}
      </Carousel>
      <div className="body">
        {/* Title and rating share a baseline, so the eye lands on the name. */}
        <div className="xrow1">
          <h3 className="title">{x.title}</h3>
          {x.rating != null && (
            <span className="xrate" title={x.reviews != null ? `${x.reviews} reviews` : undefined}>
              <Icon icon={Star} className="ico" /> {x.rating.toFixed(2)}
            </span>
          )}
        </div>
        {meta.length > 0 && (
          <div className="xmeta">
            {meta.map((m, i) => <span key={i}>{i > 0 && <span className="sep">·</span>}{m}</span>)}
          </div>
        )}
        {pinnedDay && (
          <span className="xpin"><Icon icon={CalendarDays} className="ico" /> Pinned to {dayLabel(pinnedDay).replace(/,.*$/, '')}</span>
        )}
        <div className="xprice"><ExpPrice x={x} split={split} /></div>
        {/* Borrowed from variant C: name the denominator so support can never be
            mistaken for consensus. */}
        {t.net > 0 && (
          <div className="xsupport tnum">{t.net} <span>of {split} would go</span></div>
        )}
        <div className="xfoot" onClick={(e) => e.stopPropagation()}>
          <div className="votebar">
            <button className={cn('vote up', t.mine === 'up' && 'on')} aria-label="Want to do this" aria-pressed={t.mine === 'up'} onClick={() => vote('up')}>
              <Icon icon={ThumbsUp} className="ico" /> {t.up}
            </button>
            <span className={cn('net', t.net > 0 && 'pos', t.net < 0 && 'neg', 'tnum')}>{t.net > 0 ? `+${t.net}` : t.net}</span>
            <button className={cn('vote down', t.mine === 'down' && 'on')} aria-label="Not for me" aria-pressed={t.mine === 'down'} onClick={() => vote('down')}>
              <Icon icon={ThumbsDown} className="ico" /> {t.down}
            </button>
          </div>
          <a
            className="btn btn-ghost btn-sm xopen"
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
              {/* Most OSM rows have no photo, and the landscape grid was still
                  reserving half the dialog for it — a 400px black column beside
                  the text. No photo, no gallery column. */}
              <div className={cn('dx', 'xd2', !x.photo && 'xd-nophoto')}>
                {/* Gallery (left on laptops, on top on phones) */}
                {x.photo && (
                  <div className="dx-gallery">
                    <div className="dx-lead">
                      <SafeImg src={x.photo} alt={x.title} />
                      <div className="gbadges">
                        {x.originalPrice != null && x.price != null && x.originalPrice > x.price && (
                          <span className="badge badge-under">Save ${x.originalPrice - x.price}</span>
                        )}
                        {x.category && <span className="badge">{x.category}</span>}
                      </div>
                    </div>
                  </div>
                )}

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

                  {/* Providers rarely ship a blurb and OSM never does, so a place
                      could open as nothing but a name. Scout writes the missing
                      line — and is attributed when it did, because this sits
                      next to real businesses (scout.md: always "Scout", never
                      passed off as the provider's own copy). */}
                  {x.description && (
                    <p className="xabout">
                      {x.description}
                      {x.descriptionBy === 'scout' && (
                        <span className="xabout-by"><Icon icon={Sparkles} className="ico" /> Scout</span>
                      )}
                    </p>
                  )}

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
/** "Tuesday" — for prose, where the abbreviation reads like a log entry. */
const weekdayLong = (d: string | null) => {
  if (!d) return 'the day';
  try { return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' }); }
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
/**
 * A day as a journey, not a list: stop → leg → stop down a vertical spine.
 *
 * The reference is Wanderlog / Google Maps / Citymapper — the one thing they all
 * ship and a grouped list never does is the travel between consecutive stops,
 * because that is what actually breaks a group's day. The leg is a real element
 * carrying mode + duration + distance, not prose.
 *
 * Every number here was computed server-side (see routeDay in server.js) so the
 * clock times, the reasoning and the day's totals cannot disagree with each
 * other. Travel times are estimates from straight-line distance and are shown
 * with a "~" — we have no routing provider, and a fabricated-precise "14 min"
 * would be worse than an honest approximation.
 */
function RoutedDay({ day, route, byId, onOpen, open, onToggle }: { day: string | null; route: DayRoute; byId: Map<string, Experience>; onOpen: (x: Experience) => void; open: boolean; onToggle: () => void }) {
  const rows = route.rows;
  // House bookends absorb the drive next to them. "Leave the house 9:30a" and
  // the 45-minute haul that follows are one thought, not two rows, and pulling
  // them together removes four rows from every day.
  const lead = rows[0] && 'k' in rows[0] && rows[0].k === 'anchor' ? rows[0] : null;
  const leadLeg = lead && rows[1] && 'leg' in rows[1] ? rows[1] : null;
  const last = rows[rows.length - 1];
  const tail = last && 'k' in last && last.k === 'anchor' && lead !== last ? last : null;
  const tailLeg = tail && rows[rows.length - 2] && 'leg' in rows[rows.length - 2] ? rows[rows.length - 2] : null;
  const skip = new Set<number>();
  if (lead) skip.add(0);
  if (leadLeg) skip.add(1);
  if (tail) skip.add(rows.length - 1);
  if (tailLeg) skip.add(rows.length - 2);

  // What a closed day says: the first real activity, and the numbers.
  const firstStop = rows.find((r, i) => !skip.has(i) && 'k' in r && r.k === 'stop') as Extract<RouteRow, { k: 'anchor' | 'stop' }> | undefined;
  const gist = firstStop ? byId.get(String(firstStop.id ?? '')) : undefined;
  const stopCount = rows.filter((r) => 'k' in r && r.k === 'stop').length;
  const legWords = (r: Extract<RouteRow, { leg: 'drive' | 'walk' }>) => `${r.dur} ${r.leg} · ${r.mi}`;

  return (
    <div className={cn('itin-day', 'pl', open && 'open')}>
      <button className="pl-dayrow" onClick={onToggle} aria-expanded={open}>
        <Icon icon={ChevronRight} className="ico chev" />
        <span className="date">
          <span className="wd">{weekdayLong(day).slice(0, 3)}</span>
          <span className="dn">{dayLabel(day).replace(/^\w+,\s*/, '')}</span>
        </span>
        <span className="gist">
          {gist?.photo ? <img src={gist.photo} alt="" loading="lazy" /> : <span className="ph" />}
          <span className="tx">
            <span className="nm">{firstStop?.n || 'Nothing planned'}</span>
            <span className="mo">{stopCount > 1 ? `+${stopCount - 1} more · ` : ''}{route.win}</span>
          </span>
        </span>
        <span className="figs">
          <span><b>{route.out}</b> out</span>
          {route.drive && <span className={cn(route.heavy && 'warn')}><b className={cn(route.heavy && 'warn')}>{route.drive}</b> driving</span>}
          {route.pp != null && <span className="money tnum">${route.pp} pp</span>}
        </span>
      </button>

      {open && (
        <>
          <div className="itin-body">
            {lead && (
              <div className="pl-bookend">
                <Icon icon={Home} className="ico" />
                <span>
                  Leave {lead.n.replace(/ · .*$/, '').replace(/^The /, 'the ')} <b>{lead.t}</b>
                  {leadLeg && 'leg' in leadLeg && <> · {legWords(leadLeg)}{leadLeg.why ? ` — ${leadLeg.why}` : ''}</>}
                </span>
              </div>
            )}
            <div className="itin-line">
              {rows.map((row, i) => {
                if (skip.has(i)) return null;
                if ('leg' in row) {
                  return (
                    <div className={cn('leg', row.tight && 'tight')} key={i}>
                      <Icon icon={row.leg === 'walk' ? Footprints : Car} className="ico ic" />
                      <span className="dur">{row.dur} {row.leg}</span>
                      <span>· {row.mi}</span>
                      {row.why && <span className="why">— {row.why}</span>}
                    </div>
                  );
                }
                if ('suggest' in row) {
                  // One line, one Add. The old box said "on the way" three times.
                  const x = byId.get(row.suggest.id);
                  return (
                    <div className="pl-note" key={i}>
                      <span>
                        <b>{row.suggest.n}</b> — {row.suggest.kind.toLowerCase()}, {row.suggest.why}
                        {x && <> · <button className="lnk" style={{ background: 'none', border: 0, padding: 0, color: 'var(--link)', fontWeight: 700, cursor: 'pointer' }} onClick={() => onOpen(x)}>Look</button></>}
                      </span>
                    </div>
                  );
                }
                if ('gap' in row) {
                  return <div className="pl-note gap" key={i}><span>{row.gap}</span></div>;
                }
                const x = row.id ? byId.get(row.id) : undefined;
                return (
                  <div className={cn('stop', row.k === 'anchor' && 'anchor')} key={i}>
                    <div className="stop-top">
                      <span className="stop-time">{row.t}</span>
                      {x ? <button className="stop-name" onClick={() => onOpen(x)}>{row.n}</button> : <span className="stop-name">{row.n}</span>}
                      {row.tag === 'voted' && <span className="stop-tag voted"><Icon icon={ThumbsUp} className="ico" /> voted in</span>}
                      {row.tag === 'pinned' && <span className="stop-tag pinned"><Icon icon={CalendarDays} className="ico" /> pinned</span>}
                    </div>
                    {row.facts && row.facts.length > 0 && (
                      <div className="stop-facts">
                        {row.facts.map((f, j) => (
                          <span key={j}>{j > 0 && <span className="sep">·</span>}<span className={/\$|free/i.test(f) ? 'cost' : undefined}>{f}</span></span>
                        ))}
                      </div>
                    )}
                    {row.why && <div className="stop-why"><Icon icon={CornerDownRight} className="ico" /><span>{row.why}</span></div>}
                  </div>
                );
              })}
            </div>
            {tail && (
              <div className="pl-bookend">
                <Icon icon={Home} className="ico" />
                <span>
                  {tailLeg && 'leg' in tailLeg && <>{legWords(tailLeg)} · </>}
                  back at {tail.n.replace(/ · .*$/, '').toLowerCase()} <b>{tail.t}</b>
                </span>
              </div>
            )}
          </div>
          <div className="itin-wrap">
            <Icon icon={Flag} className="ico" />
            <span className="txt">
              That&rsquo;s a wrap for {weekdayLong(day)}
              {route.heavy && <> &middot; <span style={{ color: 'var(--marginal)' }}>that&rsquo;s a lot of driving for one day</span></>}
            </span>
            <span className="tot">
              <span><b>{route.out}</b> out</span>
              {route.drive && <span><b>{route.drive}</b> driving</span>}
              {route.pp != null && <span className="tnum"><b>${route.pp}</b> pp{route.unpriced > 0 && ` (+${route.unpriced} unpriced)`}</span>}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

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
/** A route drawing itself — the tab's one piece of art, built from tokens so it
 *  follows the accent through all six skins and both themes. */
function RouteArt({ size = 132 }: { size?: number }) {
  return (
    <svg className="xart" width={size} height={size * 0.79} viewBox="0 0 132 104" fill="none" aria-hidden="true">
      <path className="trail draw" d="M18 78 C40 58, 52 74, 72 52 S104 26, 116 30"
        strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 7" />
      <circle className="pin" cx="18" cy="78" r="6.5" />
      <circle className="halo" cx="18" cy="78" r="13" strokeWidth="1.5" fill="none" />
      <circle className="pin b1" cx="72" cy="52" r="5" />
      <circle className="pin b2" cx="116" cy="30" r="5" />
      <circle className="pin b3" cx="94" cy="38" r="3.5" />
    </svg>
  );
}

/** Per-surface day expansion. Compact by default — the whole point is that a
 *  four-day plan reads in one screen before you drill in. */
function useDayCollapse(prefix: string) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [density, setDensity] = useState<'compact' | 'full'>('compact');
  const key = (i: number) => `${prefix}-${i}`;
  return {
    density,
    isOpen: (i: number) => density === 'full' || open.has(key(i)),
    toggle: (i: number) => setOpen((s0) => {
      const n = new Set(s0);
      n.has(key(i)) ? n.delete(key(i)) : n.add(key(i));
      return n;
    }),
    setDensity: (d: 'compact' | 'full') => { setDensity(d); if (d === 'compact') setOpen(new Set()); },
  };
}

/** Whole days until a shared plan link stops working. */
const planDaysLeft = (p: ExpPlan | null) => {
  if (!p?.expires_at) return null;
  const ms = new Date(p.expires_at).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86400000);
};

/**
 * The plan studio — "test out a plan".
 *
 * This is the one place a modal is right on this tab. The group's plan is a
 * persistent reference document, so it lives on a surface; testing a
 * combination is a transient experiment — enter, do one thing, look at it,
 * export or discard. That is modal-shaped, and the "test out" framing is
 * deliberate: a sandbox should feel disposable, or people won't try things.
 *
 * Portal-rendered like every other dialog here. This is NOT optional — the
 * board's .tab-panel animates a transform, which makes it the containing block
 * for position:fixed children, so an inline overlay sizes to the panel and you
 * get a dark screen with no dialog. See ExperienceModal.
 */
function PlanStudio({ plan, generating, count, shareUrl, pdfUrl, byId, onOpen, onRegenerate, onClose }: {
  plan: ExpPlan | null; generating: boolean; count: number;
  shareUrl: string | null; pdfUrl: string | null;
  byId: Map<string, Experience>; onOpen: (x: Experience) => void;
  onRegenerate: () => void; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const dc = useDayCollapse('studio');
  // Rotate the line under the spinner. Ambient layer only — it carries no
  // information, it just makes a few seconds of waiting feel attended to.
  const NOTES = [
    'Reading what you picked…',
    'Working out the order and the driving between them…',
    'Costing the day per person…',
  ];
  const [note, setNote] = useState(0);
  useEffect(() => {
    if (!generating) { setNote(0); return; }
    const t = setInterval(() => setNote((n) => (n + 1) % NOTES.length), 2200);
    return () => clearInterval(t);
  }, [generating, NOTES.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      track('my_plan_shared', { via: 'studio_copy' });
      setTimeout(() => setCopied(false), 2400);
    } catch { /* clipboard blocked — the link is still on screen */ }
  };

  const days = plan?.days.filter((d) => d.items.length > 0) ?? [];
  const daysLeft = planDaysLeft(plan);

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dx-scrim" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="dx-modalwrap"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <DialogPrimitive.Title className="sr-only">Test out a plan</DialogPrimitive.Title>
          <div className="dx-modal" style={{ maxWidth: 720 }}>
            <div className="xstudio">
              <div className="xstudio-h">
                <div className="mk"><Icon icon={Sparkles} className="ico" /></div>
                <div className="hh">
                  <div className="t">{generating ? 'Building your plan' : 'Your plan'}</div>
                  <div className="s">
                    {generating
                      ? `${count} thing${count === 1 ? '' : 's'} you picked`
                      : 'Yours to keep or throw away — the group only sees it if you share it.'}
                  </div>
                </div>
                <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon icon={X} className="ico" /></button>
              </div>

              <div className="xstudio-b">
                {generating ? (
                  <div className="xgen">
                    <RouteArt size={116} />
                    <div className="orb">
                      <span className="ring" />
                      <Icon icon={Sparkles} className="ico" />
                    </div>
                    <div className="t">Scout is routing your day</div>
                    <div className="s" key={note}>{NOTES[note]}</div>
                  </div>
                ) : days.length ? (
                  days.map((d, i) => (
                    d.route && d.route.rows.length > 0
                      ? <RoutedDay key={i} day={d.day} route={d.route} byId={byId} onOpen={onOpen} open={dc.isOpen(i)} onToggle={() => dc.toggle(i)} />
                      : (
                        <div className="xplan-day" key={i}>
                          <div className="xplan-dh">{dayLabel(d.day)}</div>
                          {d.items.map((it) => {
                            const x = byId.get(it.id);
                            if (!x) return null;
                            return (
                              <button key={it.id} className="xplan-it" onClick={() => onOpen(x)}>
                                {x.photo ? <img src={x.photo} alt="" loading="lazy" /> : <span className="ph" />}
                                <span className="tx"><b>{x.title}</b><small>{it.why || ''}</small></span>
                              </button>
                            );
                          })}
                        </div>
                      )
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '28px 0 32px' }}>
                    <RouteArt size={116} />
                    <p className="text-text-muted" style={{ margin: 0 }}>
                      Nothing to show yet — pick a few things and generate again.
                    </p>
                  </div>
                )}
              </div>

              <div className="xstudio-f">
                <button className="btn btn-ghost btn-sm" onClick={onRegenerate} disabled={generating}>
                  <Icon icon={RefreshCw} className="ico" /> Try again
                </button>
                <span className="sp" />
                {!generating && days.length > 0 && daysLeft != null && (
                  <span className={cn('xlife', daysLeft <= 2 && 'soon')} title="Shared plan links expire so they don't stay a permanent key to your trip">
                    <Icon icon={Clock} className="ico" />
                    {daysLeft === 0 ? 'Link has expired' : `Link works for ${daysLeft} more day${daysLeft === 1 ? '' : 's'}`}
                  </span>
                )}
                {copied ? (
                  <span className="xcopied"><Icon icon={Check} className="ico" /> Link copied</span>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => void copy()} disabled={generating || !days.length}>
                    <Icon icon={Share2} className="ico" /> Copy link
                  </button>
                )}
                {pdfUrl && (
                  <a className="btn btn-ghost btn-sm" href={pdfUrl} onClick={() => track('my_plan_pdf', { via: 'studio' })}>
                    <Icon icon={FileDown} className="ico" /> PDF
                  </a>
                )}
                <button className="btn btn-primary btn-sm" onClick={onClose} disabled={generating}>Done</button>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ExperiencesSection() {
  const { trip, tripId, experiences, expPending, expFailed, expVotes, user, refreshExperiences, retryExperiences, final, findListing, isOwner, itinerary, saveItinerary, toast, split, requireSignIn } = useApp();
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
  // Selecting for Scout is a MODE, not a permanent second button on every photo.
  const [pickMode, setPickMode] = useState(false);
  // Both plan renderings ship: the list is the glance, the routed day is the
  // expanded read. Routed is the default because it is the one that answers
  // "does this day actually work?".
  const [itinView, setItinView] = useState<'list' | 'route'>('route');
  // Browse (divergent — scan and vote) vs Plan (convergent — commit to a
  // sequence) are different modes, so they get their own screen instead of
  // stacking three tall panels above the grid.
  const [view, setView] = useState<'browse' | 'plan'>('browse');
  // The studio is open while you look at the result of an experiment.
  const [studioOpen, setStudioOpen] = useState(false);
  // Scout works around the posted itinerary by default — planning a hike on top
  // of the birthday dinner is the obvious failure. Turn it off when the
  // itinerary is stale and you want a clean slate.
  const [isolated, setIsolated] = useState(false);
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
  /** Returns true only if a plan actually came back — callers navigate on it,
   *  and sending someone to an empty Plan view after a failure is worse than
   *  leaving them where they were. */
  const buildMyPlan = async (): Promise<boolean> => {
    if (!tripId || myPlanning) return false;
    if (!requireSignIn('plan your days')) return false;
    const ids = picked.size ? [...picked] : [...saved];
    if (!ids.length) { toast('Save or select a few things first.', 'error'); return false; }
    setMyPlanning(true);
    try {
      const p = await api.buildMyPlan(tripId, ids);
      setMyPlan(p);
      track('my_plan_built', { count: ids.length, fallback: !!p.fallback });
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Scout could not plan that.', 'error');
      return false;
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
  // How many DISTINCT people have voted on anything — the honest denominator
  // behind the quorum line. Support bars are drawn against the party size, not
  // against the current leader (see the --pct comment on .xlb-row).
  const voterCount = useMemo(() => {
    const who = new Set<string>();
    for (const byUser of Object.values(expVotes)) for (const uid of Object.keys(byUser)) who.add(uid);
    return who.size;
  }, [expVotes]);
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
      const p = await api.planExperiences(tripId, force, isolated);
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
  // Only offer the routed view when the server could actually build one (it
  // needs coordinates); otherwise the switch would toggle to an empty panel.
  const hasRoute = !!plan?.days.some((d) => d.route && d.route.rows.length > 0);
  const myPlanDaysLeft = planDaysLeft(myPlan);
  const scoutDays = useDayCollapse('scout');
  const mineDays = useDayCollapse('mine');

  // Four situations that used to render as one. The important one is the error:
  // every read was caught and swallowed into an empty list, so a server outage
  // appeared as "no things to do found" — the product blaming the group's trip
  // for its own failure, with no way back.
  if (experiences.length === 0) {
    if (expFailed) {
      return (
        <div className="xstate error">
          <span className="ic"><Icon icon={CloudOff} className="ico" /></span>
          <div className="kicker">Couldn&rsquo;t load</div>
          <h3>We couldn&rsquo;t reach the list</h3>
          <p>This is on us, not on your trip — <b>your votes are safe</b>. Try again in a moment.</p>
          <span className="row">
            <button className="btn btn-primary btn-sm" onClick={() => void retryExperiences()}>
              <Icon icon={RefreshCw} className="ico" /> Try again
            </button>
          </span>
        </div>
      );
    }
    if (expPending) {
      return (
        <div className="xstate pending">
          <span className="ic"><span className="xspin" /></span>
          <div className="kicker">Working</div>
          <h3>Finding things to do near {trip?.destination || 'your destination'}</h3>
          <p>This usually takes about a minute — you can keep browsing homes and come back.</p>
        </div>
      );
    }
    return (
      <div className="xstate empty">
        <span className="ic"><Icon icon={Compass} className="ico" /></span>
        <div className="kicker">Nothing found</div>
        <h3>No things to do for these dates</h3>
        <p>We looked and came back empty — it happens with smaller destinations or tight date windows.</p>
        <span className="row">
          <button className="btn btn-primary btn-sm" onClick={() => void refreshExperiences()}>
            <Icon icon={RefreshCw} className="ico" /> Look again
          </button>
        </span>
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
          {/* The entry to the personal lane. It is the most inviting thing on
              the tab on purpose: "test out" says throwaway, which is what makes
              people actually try a combination. */}
          {view === 'browse' && user && !pickMode && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { setPickMode(true); track('experiences_pickmode_on', { from: 'cta' }); }}
            >
              <Icon icon={Sparkles} className="ico" /> Test out a plan
            </button>
          )}
          {/* Sorting and refreshing act on the grid, so they belong to Browse. */}
          {view === 'browse' && anchor && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setNearest((n) => !n)}
              title={`Sort by distance from ${anchor.label}`}
              style={nearest ? { borderColor: 'var(--accent)', background: 'var(--accent-tint)', color: 'var(--accent-text)' } : undefined}
            >
              <Icon icon={MapPin} className="ico" /> Nearest
            </button>
          )}
          {view === 'browse' && (
            <button className="btn btn-ghost btn-sm" onClick={() => void refreshExperiences()} title="Refresh the list">
              <Icon icon={RefreshCw} className="ico" /> Refresh
            </button>
          )}
        </div>
      </div>

      <div className="xseg" role="tablist" aria-label="Things to do view" style={{ margin: '0 0 14px' }}>
        <button role="tab" aria-selected={view === 'browse'} className={cn(view === 'browse' && 'on')} onClick={() => setView('browse')}>
          <Icon icon={Compass} className="ico" /> Browse <span className="n tnum">{sorted.length}</span>
        </button>
        <button role="tab" aria-selected={view === 'plan'} className={cn(view === 'plan' && 'on')}
          onClick={() => { setView('plan'); track('experiences_view', { view: 'plan' }); }}>
          <Icon icon={CalendarDays} className="ico" /> Plan
          {/* A quiet dot, not a badge: it says "there's something here" without
              shouting at people who are mid-browse. */}
          {view !== 'plan' && (plan?.days.length || myPlan?.days.length) ? <span className="dot" /> : null}
        </button>
      </div>
      {/* ══ PLAN ══ the group's answer -> a machine's proposal -> your own
          version, in that narrative order. A reading surface, not a grid. */}
      {view === 'plan' && (
      <div className="xplan-view">
      {/* KIND 1 — the group's answer. Solid and authoritative: this is what the
          group decided, as opposed to what a machine proposed. */}
      <div className="xp k-group">
        <div className="xp-h">
          <div className="mk"><Icon icon={Trophy} className="ico" /></div>
          <div className="hh">
            <span className="xp-kind"><Icon icon={Users} className="ico" /> The group&rsquo;s answer</span>
            <div className="xp-t">Top of the list</div>
            <div className="xp-s">
              {groupList.length
                ? `${groupList.length} in the running · ranked by how many of you would go`
                : 'nothing ranked yet'}
            </div>
          </div>
          {groupList.length > 0 && (
            <span className="xp-acts">
              {itinerary.text?.trim() && (
                <label className="xitin" title="Your trip itinerary is what the organizer posted. Scout works around it unless you turn this off.">
                  <input type="checkbox" checked={!isolated} onChange={(e) => setIsolated(!e.target.checked)} />
                  <span>Work around our itinerary</span>
                </label>
              )}
              <button className="btn btn-sm" onClick={() => void runPlan(!!plan)} disabled={planning}>
                <Icon icon={Sparkles} className="ico" /> {planning ? 'Scout is planning…' : plan ? 'Re-plan' : 'Scout: plan our days'}
              </button>
              {isOwner && (
                <button className="btn btn-ghost btn-sm" onClick={() => void sendToItinerary()} disabled={sending}>
                  <Icon icon={ListPlus} className="ico" /> Add list to trip plan
                </button>
              )}
            </span>
          )}
        </div>

        {groupList.length === 0 ? (
          // N = 0 is a teaching state, not an empty box: the first vote is the
          // moment that decides whether voting feels alive or embarrassing, so
          // name what one vote actually does.
          <div className="xlb-teach">
            <span className="ic"><Icon icon={ThumbsUp} className="ico" /></span>
            <div>
              <div className="tt">Nothing&rsquo;s in the running yet</div>
              <div className="ss">
                Hit <Icon icon={ThumbsUp} className="ico inline align-text-bottom" /> on anything below and it climbs
                this list. It takes one vote to start it and the whole group to settle it.
              </div>
            </div>
          </div>
        ) : (
          <ol className="xlb-rows">
            {groupList.map((x, i) => {
              const tl = expTally(expVotes, x.id, user?.id ?? null);
              const meta = [
                x.price != null ? `$${x.price}/${x.priceUnit === 'group' ? 'group' : 'guest'}` : null,
                x.duration != null ? fmtMins(x.duration) : null,
                dayPins[x.id] ? `pinned ${dayLabel(dayPins[x.id]).replace(/,.*$/, '')}` : null,
              ].filter(Boolean).join(' · ');
              return (
                <li key={x.id}>
                  <button
                    className={cn('xlb-row', i === 0 && 'lead')}
                    // ABSOLUTE, never relative. Measuring support against the
                    // current leader meant the very first vote filled its row
                    // 100% — which teaches people the number is fake, and once
                    // they distrust it they stop voting. One of fourteen is 7%.
                    style={{ ['--pct' as string]: `${Math.max(0, Math.min(100, (tl.net / Math.max(1, split)) * 100)).toFixed(1)}%` }}
                    onClick={() => { setOpenX(x); track('experience_detail_opened', { experience_id: x.id, surface: 'leaderboard' }); }}
                  >
                    <span className="xlb-rk tnum">{i + 1}</span>
                    {x.photo
                      ? <img className="xlb-thumb" src={x.photo} alt="" loading="lazy" />
                      : <span className="xlb-thumb" />}
                    <span className="xlb-main">
                      <span className="xlb-name">{x.title}{tl.mine === 'up' && <span style={{ color: 'var(--accent-text)', fontWeight: 600 }}> · you liked</span>}</span>
                      {meta && <span className="xlb-meta">{meta}</span>}
                    </span>
                    <span className="xlb-likes tnum">{tl.net} <small>of {split}</small></span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {/* The denominator, out loud. A bar nobody can size against a total is
            just a decoration. */}
        <div className="xlb-quorum">
          <Icon icon={Users} className="ico" />
          <span><b className="tnum">{voterCount}</b> of {split} have voted</span>
          <span className="track"><span className="fill" style={{ width: `${Math.min(100, (voterCount / Math.max(1, split)) * 100)}%` }} /></span>
        </div>
      </div>

      {/* Scout's day-by-day plan — attributed, and only saved to the trip plan
          when a human presses the button (scout.md: Scout never mutates state). */}
      {/* KIND 2 — a machine's proposal. Tinted and labelled "Scout · proposal"
          so a member can always tell a machine opinion from a group decision,
          and the button that writes to the shared itinerary stays owner-only. */}
      {plan && plan.days.length > 0 && (
        <div className="xp k-scout">
          <div className="xp-h">
            <div className="mk"><Icon icon={Sparkles} className="ico" /></div>
            <div className="hh">
              <span className="xp-kind"><Icon icon={Sparkles} className="ico" /> Scout · proposal</span>
              <div className="xp-t">Scout&rsquo;s plan{plan.fallback ? ' · by votes' : ''}</div>
              <div className="xp-s">
                {plan.days.length} day{plan.days.length === 1 ? '' : 's'} routed from the group&rsquo;s votes
                {planCost && planCost.counted > 0 && <> · ~<b className="tnum">${planCost.perPerson}</b>/person all in{planCost.missing > 0 && ` (+${planCost.missing} unpriced)`}</>}
              </div>
            </div>
            <span className="xp-acts">
              {hasRoute && itinView === 'route' && (
                <span className="pl-density">
                  <button className={cn(scoutDays.density === 'compact' && 'on')} onClick={() => scoutDays.setDensity('compact')}>Compact</button>
                  <button className={cn(scoutDays.density === 'full' && 'on')} onClick={() => scoutDays.setDensity('full')}>Full</button>
                </span>
              )}
              {hasRoute && (
                <span className="itin-switch">
                  <button className={cn(itinView === 'list' && 'on')} onClick={() => setItinView('list')}>List</button>
                  <button className={cn(itinView === 'route' && 'on')} onClick={() => { setItinView('route'); track('experiences_plan_routed'); }}>Routed day</button>
                </span>
              )}
              {isOwner && (
                <button className="btn btn-primary btn-sm" onClick={() => void savePlan()} disabled={sending}>
                  <Icon icon={ListPlus} className="ico" /> {sending ? 'Adding…' : 'Add to trip plan'}
                </button>
              )}
            </span>
          </div>

          {hasRoute && itinView === 'route' ? (
            <div className="xplan">
              {plan.days.map((d, i) => (
                d.route
                  ? <RoutedDay key={i} day={d.day} route={d.route} byId={byId}
                      open={scoutDays.isOpen(i)} onToggle={() => scoutDays.toggle(i)}
                      onOpen={(x) => { setOpenX(x); track('experience_detail_opened', { experience_id: x.id, surface: 'scout_route' }); }} />
                  : null
              ))}
            </div>
          ) : (
            // The compact surface read. Both renderings ship: the list is the
            // glance, the routed day is the expanded one.
            <div className="xplan">
              {plan.days.map((d, i) => (
                <div className="xplan-day" key={i} style={{ animationDelay: `${i * 70}ms` }}>
                  <div className="xplan-dh">{dayLabel(d.day)}</div>
                  {d.items.map((it) => {
                    const x = byId.get(it.id);
                    if (!x) return null;
                    return (
                      <button key={it.id} className="xplan-it" onClick={() => { setOpenX(x); track('experience_detail_opened', { experience_id: x.id, surface: 'scout_plan' }); }}>
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

      {/* ── My plan (personal lane) ─────────────────────────────────────────
          Your own saved picks, planned by Scout just for you, shareable as a
          link so you can drop "this is my plan" into the group chat. */}
      {/* KIND 3 — yours. Inset, quiet, explicitly private: it must never look
          like it speaks for the group. This panel is also what turns pick mode
          on, which is why selecting for Scout could leave the photo. */}
      {user && (saved.size > 0 || picked.size > 0 || myPlan) && (
        <div className="xp k-mine">
          <div className="xp-h">
            <div className="mk"><Icon icon={Bookmark} className="ico" /></div>
            <div className="hh">
              <span className="xp-kind"><Icon icon={Lock} className="ico" /> Private to you</span>
              <div className="xp-t">My plan{myPlan?.fallback ? ' · by picks' : ''}</div>
              <div className="xp-s">
                {pickMode
                  ? picked.size > 0
                    ? `${picked.size} selected — Scout will plan exactly these`
                    : 'Tap the cards you want Scout to plan'
                  : myPlan
                    ? `${myPlan.days.reduce((n, d) => n + d.items.length, 0)} activities over ${myPlan.days.length} day${myPlan.days.length === 1 ? '' : 's'}`
                    : `${saved.size} saved`}
                {myPlan && myPlanDaysLeft != null && (
                  myPlanDaysLeft === 0
                    ? <> &middot; <span style={{ color: 'var(--marginal)' }}>share link expired — re-plan to revive it</span></>
                    : <> &middot; share link works for {myPlanDaysLeft} more day{myPlanDaysLeft === 1 ? '' : 's'}</>
                )}
              </div>
            </div>
            <div className="xp-acts">
              {/* Picking happens against the items, so this jumps to them. */}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setPickMode(true); setView('browse'); track('experiences_pickmode_on', { from: 'myplan' }); }}
              >
                <Icon icon={Check} className="ico" /> {picked.size ? `Change picks · ${picked.size}` : 'Pick things'}
              </button>
              <button className="btn btn-sm" onClick={() => { setStudioOpen(true); void buildMyPlan(); }} disabled={myPlanning}>
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
              {/* Your plan is the one you actually walk, so it gets the routed
                  day too — same rendering as the group's, from the same server
                  computation. Falls back to the flat list without coordinates. */}
              {myPlan.days.map((d, di) => (
                d.route && d.route.rows.length > 0 ? (
                  <RoutedDay key={di} day={d.day} route={d.route} byId={byId}
                    open={mineDays.isOpen(di)} onToggle={() => mineDays.toggle(di)}
                    onOpen={(x) => { setOpenX(x); track('experience_detail_opened', { experience_id: x.id, surface: 'my_plan_route' }); }} />
                ) : (
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
                )
              ))}
            </div>
          )}
        </div>
      )}

      </div>
      )}

      {/* ══ BROWSE ══ chips + items. The only thing above the grid is one row
          of voting feedback, because a vote that visibly does nothing stops
          being cast. Everything else moved to Plan. */}
      {view === 'browse' && (
      <>
      {groupList.length > 0 && (
        <button className="xlead" onClick={() => { setView('plan'); track('experiences_view', { view: 'plan', from: 'leadbar' }); }}>
          <span className="lb">Leading</span>
          <span className="nm">{groupList[0].title}</span>
          <span className="q"><b className="tnum">{voterCount}</b> of {split} have voted</span>
          <span className="go">See the plan <Icon icon={ArrowRight} className="ico" /></span>
        </button>
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

      {/* Filtered-empty is NOT the same as empty: the rest of the list is still
          there, and saying so is the difference between a dead end and a nudge. */}
      {sorted.length === 0 && (vibe || showSavedOnly) && (
        <div className="xstate filtered">
          <span className="ic"><Icon icon={FilterX} className="ico" /></span>
          <div className="kicker">Filtered</div>
          <h3>Nothing in {showSavedOnly && !vibe ? 'your saved list' : `“${EXP_VIBES.find((v) => v.key === vibe)?.label ?? 'that vibe'}”`}</h3>
          <p>Your other {experiences.length} {experiences.length === 1 ? 'thing' : 'things'} to do are still here — this filter just has no matches yet.</p>
          <span className="row">
            <button className="btn btn-ghost btn-sm" onClick={() => { setVibe(null); setShowSavedOnly(false); }}>
              Show all {experiences.length}
            </button>
          </span>
        </div>
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
            pickMode={pickMode}
            onTogglePick={() => setPicked((s0) => { const n = new Set(s0); n.has(x.id) ? n.delete(x.id) : n.add(x.id); return n; })}
            onOpen={() => { setOpenX(x); track('experience_detail_opened', { experience_id: x.id }); }}
          />
        ))}
      </div>
      {/* The lab's action bar: what you've mixed together, and the one button
          that turns it into a plan. Sticky so it survives a long grid. */}
      {pickMode && (
        <div className="xpickbar">
          <span className="cnt tnum">{picked.size} <span>selected</span></span>
          {picked.size > 0 && (
            <button className="lnk" onClick={() => setPicked(new Set())}>Clear</button>
          )}
          <button className="lnk" onClick={() => { setPickMode(false); setPicked(new Set()); }}>Cancel</button>
          <button
            className="btn btn-primary btn-sm"
            disabled={myPlanning || picked.size === 0}
            onClick={() => { setStudioOpen(true); void buildMyPlan(); }}
          >
            <Icon icon={Sparkles} className="ico" /> Generate plan
          </button>
        </div>
      )}
      </>
      )}

      {studioOpen && (
        <PlanStudio
          plan={myPlan}
          generating={myPlanning}
          count={picked.size || saved.size}
          shareUrl={tripId && user ? `${window.location.origin}/s/plan/${encodeURIComponent(tripId)}/${encodeURIComponent(user.id)}` : null}
          pdfUrl={tripId && user ? `/s/plan/${encodeURIComponent(tripId)}/${encodeURIComponent(user.id)}.pdf` : null}
          byId={byId}
          onOpen={(x) => { setStudioOpen(false); setOpenX(x); }}
          onRegenerate={() => void buildMyPlan()}
          onClose={() => { setStudioOpen(false); setPickMode(false); }}
        />
      )}

      {openX && (
        <ExperienceModal x={openX} dist={distOf.get(openX.id) ?? null} anchorLabel={anchor?.label} onClose={() => setOpenX(null)} />
      )}
    </section>
  );
}

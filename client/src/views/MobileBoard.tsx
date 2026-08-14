import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Crown, Settings, Bookmark, Moon, Sun, Star,
  SlidersHorizontal, Check, Home,
  BadgeCheck, MessageSquare, Plus, Sparkles, Swords, Users,
  HelpCircle, Minus, TrendingUp, Send, Lock, X, Info, Scale, UserPlus, RotateCw, Pencil,
  Compass, ThumbsUp, ThumbsDown, MapPin, MoreHorizontal, Share2,
  Tag, UsersRound, CalendarDays, Link2, Link2Off, Eye,
} from 'lucide-react';
import { useApp, isDeadListing } from '@/store/AppContext';
import { api } from '@/lib/api';
import { ScoutVerdict } from '@/components/board/ScoutVerdict';
import { SplitPill } from '@/components/board/SplitPill';
import { WhosComing } from '@/components/board/WhosComing';
import { Avatar } from '@/components/ui/Avatar';
import { Markdown } from '@/components/Markdown';
import { useCompare, toInput } from '@/hooks/useCompare';
import { ComparisonModal } from '@/components/modals/ComparisonModal';
import { ItineraryCard } from '@/components/board/ItineraryCard';
import { MobilePhotoCarousel } from '@/components/MobilePhotoCarousel';
import { ExperienceStates, expListState } from '@/components/board/ExperienceStates';
import { markScrolling, useDeliberateTap } from '@/lib/tap';
import { type Filters, readFilters, writeFilters, DEFAULT_FILTERS } from '@/components/board/FilterBar';
import { useMobileShellLock } from '@/lib/useIsMobile';
import { Icon } from '@/components/ui/Icon';
import { fmt, fmtMins, netVotes, expAnchor, expDistanceMi } from '@/lib/utils';
import { cn } from '@/lib/cn';
import { expTally, ExpPrice, ExperienceModal, expGroupList, EXP_VIBES, expMatchesVibe, EXP_PREDS, RoutedDay, PanelDigest, useDayCollapse, expPlanPerPerson, planDaysLeft as expPlanDaysLeft } from '@/components/board/ExperiencesSection';
import { track } from '@/lib/analytics';
import type { Listing, Experience, ExpPlan, ExpDaysMap } from '@/types';

type View = 'home' | 'shortlist' | 'decision' | 'chat' | 'saved' | 'todo';

const B_SHORT: Record<string, string> = { under: 'Under', marginal: 'Marginal', over: 'Over', unknown: 'TBD' };

function rangeLabel(a?: string, b?: string) {
  if (!a) return '';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  try {
    const da = new Date(a + 'T00:00:00'), db = b ? new Date(b + 'T00:00:00') : null;
    const sa = da.toLocaleDateString('en-US', opts);
    if (!db) return sa;
    const sb = db.toLocaleDateString('en-US', { day: 'numeric' });
    return `${sa} – ${sb}, ${db.getFullYear()}`;
  } catch { return ''; }
}

export function MobileBoard() {
  const {
    trip, submitted, pipeline, votes, roster, final, caveats, isOwner, split,
    favoriteIds, shortlistIds, itinerary, aiRankIndex, aiWhy, aiRankLoading, recommendedPool, suppressedIds, pooledListings,
    user, openAuth, joinTrip, findListing, insights,
    toggleFavorite, toggleFinalPick, setDecision, openDetail, requireSignIn, postCaveat,
    approveCaveat, deleteCaveat, saveItinerary,
    submitListing, toast, selected, toggleSelect, clearSelection, startOnboarding,
    experiences, expVotes, expPending, expFailed, castExpVote, refreshExperiences, retryExperiences, tripId,
  } = useApp();
  const compare = useCompare();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useMobileShellLock();
  const [view, setView] = useState<View>('home');
  // Honour ?tab= the same way the desktop board does. Without this the
  // announcement email's deep link drops phone readers on Homes, which is the
  // one surface the email isn't about.
  const tabParam = searchParams.get('tab');
  useEffect(() => {
    const map: Record<string, View> = { todo: 'todo', shortlist: 'shortlist', saved: 'saved', decision: 'decision', discussion: 'chat', all: 'home' };
    if (tabParam && map[tabParam]) setView(map[tabParam]);
    // Arrival only — after that the tab bar owns it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);
  const isGuest = !!trip && !trip.isMember && !trip.isOwner;
  const joinThisTrip = () => {
    if (!user) { openAuth('join this trip'); return; }
    if (trip) void joinTrip(trip.id, searchParams.get('join') || undefined);
  };
  // Persistent per-trip filters, shared with the desktop board (survive refresh).
  const [filters, setFilters] = useState<Filters>(() => readFilters(trip?.id));
  const filtersTripRef = useRef(trip?.id);
  useEffect(() => {
    if (filtersTripRef.current !== trip?.id) { filtersTripRef.current = trip?.id; setFilters(readFilters(trip?.id)); }
  }, [trip?.id]);
  useEffect(() => { writeFilters(trip?.id, filters); }, [filters, trip?.id]);
  const [sheet, setSheet] = useState<'add' | 'filter' | 'more' | null>(null);
  const [addUrl, setAddUrl] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const [adding, setAdding] = useState(false);
  const [seeAllRec, setSeeAllRec] = useState(false);
  const [itinEditOpen, setItinEditOpen] = useState(false);
  const [itinDraft, setItinDraft] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // "Things to do": nearest-first sort once the decision anchor exists (2.2).
  const [expNearest, setExpNearest] = useState(false);
  const [expOpen, setExpOpen] = useState<Experience | null>(null);
  const [expVibe, setExpVibe] = useState<string | null>(null); // Phase 4 vibe filter
  const [expSaved, setExpSaved] = useState<Set<string>>(new Set());
  const [expPicked, setExpPicked] = useState<Set<string>>(new Set());
  const [myExpPlan, setMyExpPlan] = useState<ExpPlan | null>(null);
  const [expPlanning, setExpPlanning] = useState(false);
  const [expSavedOnly, setExpSavedOnly] = useState(false);
  // Quick filters live in a sheet rather than more chips: the chip row is
  // already the category axis, and stacking a second axis into it makes the
  // row a lucky dip. Keys index EXP_PREDS — the counts and the filtering read
  // the same predicate, so the sheet can never promise a number it won't show.
  const [expFilters, setExpFilters] = useState<Record<string, boolean>>({});
  const [expSheet, setExpSheet] = useState(false);
  // Same collapse hook the desktop panels use — a four-day plan has to read in
  // one screen before you drill in, and that matters more on a phone than off.
  const expMineDays = useDayCollapse('mob-mine');
  // A tap that began as a scroll, or landed to stop momentum, must not open a
  // card. One instance binds every card — there's only ever one pointer.
  const tap = useDeliberateTap();
  const [expTripDays, setExpTripDays] = useState<string[]>([]);
  const [expReview, setExpReview] = useState(false);
  const [expShareSheet, setExpShareSheet] = useState(false);
  const [expLinkBusy, setExpLinkBusy] = useState(false);
  // Selecting for Scout is a mode, not a permanent second button on the photo.
  const [expPickMode, setExpPickMode] = useState(false);
  // Browse (scan and vote) vs Plan (commit to a sequence) — the same split the
  // desktop tab got, as a segmented control because that is the native pattern.
  const [expView, setExpView] = useState<'browse' | 'plan'>('browse');
  const [expDayPins, setExpDayPins] = useState<ExpDaysMap>({});
  useEffect(() => {
    if (!tripId) return;
    let dead = false;
    api.expDays(tripId).then((m) => { if (!dead) setExpDayPins(m || {}); }).catch(() => {});
    return () => { dead = true; };
  }, [tripId, expOpen]); // re-read when the dialog closes — a pin may have changed
  useEffect(() => {
    if (!trip || !user) return;
    let dead = false;
    api.expSaves(trip.id).then((r) => { if (!dead) setExpSaved(new Set(r.ids)); }).catch(() => {});
    api.tripDays(trip.id).then((d) => { if (!dead) setExpTripDays(d.days || []); }).catch(() => {});
    api.myPlan(trip.id).then((p) => { if (!dead) setMyExpPlan(p); }).catch(() => {});
    return () => { dead = true; };
  }, [trip?.id, user?.id]);
  // Personal "ask Scout" lane (not cached, not shared with the group).
  const [askQ, setAskQ] = useState('');
  const [askBusy, setAskBusy] = useState(false);
  const [askAns, setAskAns] = useState<string | null>(null);
  const askScout = async () => {
    const q = askQ.trim();
    if (!q || !trip) return;
    if (!requireSignIn('ask Scout')) return;
    setAskBusy(true);
    try { const res = await api.askScout(trip.id, shortlist.map(toInput), q); setAskAns(res.answer); setAskQ(''); }
    catch (e) { toast(e instanceof Error ? e.message : 'Scout could not answer right now.', 'error'); }
    finally { setAskBusy(false); }
  };
  const refreshHomes = async () => {
    if (!trip || refreshing) return;
    setRefreshing(true);
    try { await api.refreshListings(trip.id); toast('Refreshing listings. Fresh homes appear in about a minute.', 'success'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not refresh right now.', 'error'); }
    finally { setRefreshing(false); }
  };

  const openAdd = () => { if (requireSignIn('add a home')) setSheet('add'); };
  const addHome = async () => {
    if (!addUrl.trim()) { toast('Paste a listing URL first.', 'error'); return; }
    setAdding(true);
    try { await submitListing(addUrl.trim(), addPrice.trim() || undefined); toast('Added to your group’s board.', 'success'); setSheet(null); setAddUrl(''); setAddPrice(''); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not add that link.', 'error'); }
    finally { setAdding(false); }
  };
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');

  const ppOf = (l: Listing) => (l.est_5n ? fmt(Math.ceil(l.est_5n / Math.max(1, split))) : null);
  const netOf = (l: Listing) => netVotes(votes, l.id);
  const shortName = (n: string) => n.split(/[·,]/)[0].trim().split(' ').slice(0, 4).join(' ');
  const areaShort = (a?: string) => (a ? a.split('·')[0].trim() : '');

  const passes = (l: Listing) => {
    if (filters.under && !(l.budget === 'under' || l.budget === 'marginal')) return false;
    if (filters.pool && l.pool !== 'yes') return false;
    if (filters.parking && l.parking !== 'yes') return false;
    if (filters.hottub && l.hot_tub !== 'yes') return false;
    if (filters.sleeps && (l.sleeps ?? 0) < filters.sleeps) return false;
    if (!filters.manual && l.check_manual) return false; // same rule as the desktop board
    return true;
  };
  // Recommended = the cross-pool, budget-safe, Scout-ranked set (top 10), with
  // the active filters applied. Already deduped + ordered in the store.
  const visible = useMemo(() => {
    return recommendedPool.filter((l) => !shortlistIds.has(l.id) && passes(l));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendedPool, shortlistIds, filters]);
  // Shortlist = liked homes still in the running — drawn from the FULL deduped
  // pool (community + live + curated), minus the locked official pick (it's
  // decided; it lives in the Decision tab + the leader strip now).
  const shortlist = useMemo(
    () => pooledListings.filter((l) => shortlistIds.has(l.id) && final.decision?.listing_id !== l.id),
    [pooledListings, shortlistIds, final.decision],
  );
  const savedItems = useMemo(() => pooledListings.filter((l) => favoriteIds.has(l.id)), [pooledListings, favoriteIds]);
  // Browse rows exclude cross-source duplicates already shown elsewhere.
  const communityItems = useMemo(() => submitted.filter((l) => !suppressedIds.has(l.id)), [submitted, suppressedIds]);
  const liveItems = useMemo(() => pipeline.filter((l) => !suppressedIds.has(l.id)), [pipeline, suppressedIds]);
  // Over-budget / unpriced homes can't be recommended but must stay browsable.
  // Community + live rows already show their own (all budgets), so this row only
  // covers the leftovers those rows don't render — i.e. curated homes.
  const beyondBudget = useMemo(() => {
    const inRec = new Set(recommendedPool.map((l) => l.id));
    const shownElsewhere = new Set([...submitted, ...pipeline].map((l) => l.id));
    const decided = final.decision?.listing_id;
    return pooledListings
      .filter((l) => !inRec.has(l.id) && !shownElsewhere.has(l.id) && !shortlistIds.has(l.id) && l.id !== decided && !isDeadListing(l))
      .sort((a, b) => (a.est_5n ?? Number.MAX_SAFE_INTEGER) - (b.est_5n ?? Number.MAX_SAFE_INTEGER));
  }, [pooledListings, recommendedPool, submitted, pipeline, shortlistIds, final.decision]);

  const groupTotal = trip?.adults || trip?.memberCount || 14;
  const votedCount = useMemo(() => {
    const s = new Set<string>();
    for (const lid of Object.keys(votes || {})) for (const u of Object.keys((votes as any)[lid] || {})) s.add(u);
    return s.size;
  }, [votes]);
  const leader = useMemo(() => {
    const pool = shortlist.length ? shortlist : pooledListings;
    return pool.slice().sort((a, b) => ((final.counts?.[b.id] || 0) - (final.counts?.[a.id] || 0)) || (netOf(b) - netOf(a)))[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortlist, pooledListings, final.counts, votes]);
  // findListing is alias-aware and searches all three pools, so a decision
  // locked on a community/live home (or a deduped duplicate) still resolves.
  const official = final.decision?.listing_id ? findListing(final.decision.listing_id) ?? null : null;
  const pct = Math.round((votedCount / Math.max(1, groupTotal)) * 100);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('gp_theme', next); } catch { /* ignore */ }
    setTheme(next);
  };
  // ---- pieces ----
  const ring = (
    <div className="ring">
      <svg width="44" height="44" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--surface-sunken)" strokeWidth="4" />
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={(2 * Math.PI * 18).toFixed(1)} strokeDashoffset={(2 * Math.PI * 18 * (1 - pct / 100)).toFixed(1)} />
      </svg>
      <span className="pct tnum">{pct}%</span>
    </div>
  );

  const pulse = official ? (
    <div className="pulse locked" onClick={() => setView('decision')}>
      <div className="seal"><Icon icon={BadgeCheck} className="ico" /></div>
      <div className="who">
        <div className="k"><Icon icon={BadgeCheck} className="ico" /> Official pick · locked</div>
        <div className="nm">{shortName(official.name)}</div>
        <div className="sub"><b>{fmt(official.est_5n)}</b> all-in · <b>{ppOf(official)}</b>/person</div>
      </div>
      <span className="go"><Icon icon={ChevronRight} className="ico" /></span>
    </div>
  ) : leader ? (
    <div className="pulse" onClick={() => setView('decision')}>
      {ring}
      <div className="who">
        <div className="k"><Icon icon={Star} className="ico" /> Current leader · {votedCount}/{groupTotal} voted</div>
        <div className="nm">{shortName(leader.name)}</div>
        <div className="sub"><b>{final.counts?.[leader.id] || 0} top votes</b> · {ppOf(leader) || '—'}/person</div>
      </div>
      <span className="go"><Icon icon={ChevronRight} className="ico" /></span>
    </div>
  ) : null;

  const fchip = (k: 'under' | 'pool' | 'parking' | 'hottub', t: string) => (
    <button className={cn('fchip', filters[k] && 'on')} onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))}>
      {filters[k] && <Icon icon={Check} className="ico" />}{t}
    </button>
  );
  const activeFilters = (filters.under ? 1 : 0) + (filters.pool ? 1 : 0) + (filters.parking ? 1 : 0) + (filters.hottub ? 1 : 0) + (filters.sleeps ? 1 : 0) + (!filters.manual ? 1 : 0);

  function mcard(l: Listing, opts: { compact?: boolean; by?: boolean } = {}) {
    const isOff = official?.id === l.id;
    const b = l.budget || 'unknown';
    // Who liked this home (members only — guests have an empty roster).
    const upvoters = roster.length
      ? Object.entries((votes as Record<string, Record<string, string>>)[l.id] || {})
          .filter(([, v]) => v === 'up').map(([uid]) => roster.find((m) => m.id === uid)).filter((m): m is NonNullable<typeof m> => !!m)
      : [];
    const rt = opts.by ? null : (l.rating
      ? <span className="rt"><Icon icon={Star} className="ico" /> {l.rating}</span>
      : <span className="rt none"><Icon icon={Star} className="ico" /> New</span>);
    return (
      <article key={l.id} className={cn('mcard', opts.compact && 'compact')} role="button" tabIndex={0}
        {...tap.bind(() => openDetail(l.id))}>
        <div className="ph">
          <MobilePhotoCarousel photos={l.photos} alt={l.name}>
            {isOff
              ? <span className="ribbon"><Icon icon={BadgeCheck} className="ico" /> Official pick</span>
              : <div className="tagL"><span className={`pchip ${b}`}><Icon icon={b === 'under' ? Check : b === 'over' ? TrendingUp : b === 'unknown' ? HelpCircle : Minus} className="ico" /> {B_SHORT[b]}</span>{l.available === false && <span className="pchip unavail"><Icon icon={X} className="ico" /> Unavailable</span>}</div>}
            {!opts.compact && (
              <button className={cn('save', final.myPick === l.id && 'on gold')} style={{ right: 92 }} onClick={(e) => { e.stopPropagation(); if (requireSignIn('cast your top choice')) void toggleFinalPick(l.id); }} aria-label="Top choice" title="Make my top choice">
                <Icon icon={Star} className="ico" />
              </button>
            )}
            <button className={cn('save', selected.has(l.id) && 'on')} style={{ right: 52 }} onClick={(e) => { e.stopPropagation(); toggleSelect(l.id); }} aria-label="Select to compare" title="Compare">
              <Icon icon={Scale} className="ico" />
            </button>
            <button className={cn('save', favoriteIds.has(l.id) && 'on')} onClick={(e) => { e.stopPropagation(); if (requireSignIn('save')) void toggleFavorite(l.id); }} aria-label="Save">
              <Icon icon={Bookmark} className="ico" />
            </button>
          </MobilePhotoCarousel>
        </div>
        <div className="info">
          <div className="row1"><span className="nm">{shortName(l.name)}</span>{rt}</div>
          <div className="sub">{opts.by ? `${areaShort(l.area)} · sleeps ${l.sleeps ?? '—'}` : `${l.source} · ${areaShort(l.area)} · sleeps ${l.sleeps ?? '—'}`}</div>
          <div className="pr">
            {l.est_5n ? <span className="amt tnum">{fmt(l.est_5n)}</span> : <span className="amt">Price on inquiry</span>}
            {opts.by
              ? <span className="by"><span className="av">{(l.submitted_by || 'G').slice(0, 1)}</span> {l.submitted_by}</span>
              : (l.est_5n ? <>total · <span className={cn('pp', l.budget === 'over' ? 'bad' : 'ok')}>{ppOf(l)}/person</span></> : null)}
          </div>
          {!opts.compact && upvoters.length > 0 && (
            <div className="mlikes" title={`Liked by ${upvoters.map((m) => m.name).join(', ')}`}>
              <span className="vote-who">
                {upvoters.slice(0, 4).map((m) => <span className="vw-av" key={m.id}><Avatar name={m.name} avatar={m.avatar} size={20} /></span>)}
                {upvoters.length > 4 && <span className="vw-more tnum">+{upvoters.length - 4}</span>}
              </span>
              <span className="mlikes-t">liked by {upvoters.length}</span>
            </div>
          )}
          {!opts.compact && aiWhy[l.id] && (
            <div className="ai-why"><Icon icon={Sparkles} className="ico" /><span>{aiWhy[l.id]}</span></div>
          )}
        </div>
      </article>
    );
  }

  // ---- views ----
  const homeView = (
    <>
      {pulse}
      <div className="sec">
        <div className="sec-h"><span className="t">Recommended</span><span className="c tnum">Top {Math.min(10, visible.length)}</span></div>
        <div className="sec-sub">{aiRankLoading ? 'Scout is ranking these for your group…' : aiRankIndex.size ? 'Ranked by Scout across all sources · within budget · tap a home for the breakdown' : 'Ranked for your group · within budget · tap a home for the breakdown'}</div>
        {visible.length ? (
          <>
            <div className="list">{(seeAllRec ? visible : visible.slice(0, 10)).map((l) => mcard(l))}</div>
            {visible.length > 10 && (
              <button className="btn btn-ghost" style={{ width: '100%', marginTop: 4 }} onClick={() => setSeeAllRec((v) => !v)}>
                {seeAllRec ? 'Show top 10' : `See all ${visible.length}`}
              </button>
            )}
          </>
        ) : (
          <div className="empty"><div className="ec"><Icon icon={Home} className="ico" /></div><h3>No homes match</h3><p>Loosen the filters to see more.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>
              {isOwner && <button className="btn btn-primary" disabled={refreshing} onClick={() => void refreshHomes()}><Icon icon={RotateCw} className="ico" /> {refreshing ? 'Searching…' : 'Search rentals'}</button>}
            </div>
          </div>
        )}
      </div>
      {communityItems.length > 0 && (
        <div className="sec">
          <div className="sec-h"><span className="t">From your group</span><span className="c tnum">{communityItems.length}</span></div>
          <div className="sec-sub">Member-added · they rise into the shortlist once liked · swipe →</div>
          <div className="hrow">{communityItems.map((l) => mcard(l, { compact: true, by: true }))}</div>
        </div>
      )}
      {beyondBudget.length > 0 && (
        <div className="sec">
          <div className="sec-h"><span className="t">Beyond the budget</span><span className="c tnum">{beyondBudget.length}</span></div>
          <div className="sec-sub">Over budget or unpriced · still worth a look · swipe →</div>
          <div className="hrow">{beyondBudget.map((l) => mcard(l, { compact: true }))}</div>
        </div>
      )}
      {liveItems.length > 0 && (
        <div className="sec">
          <div className="sec-h"><span className="t">More LA homes</span><span className="c tnum">{liveItems.length}</span></div>
          <div className="sec-sub">Auto-refreshed from Airbnb &amp; VRBO · swipe →</div>
          <div className="hrow">{liveItems.map((l) => mcard(l, { compact: true }))}</div>
        </div>
      )}
    </>
  );

  const aiCard = (
    <div className="ai-card">
      <div className="ah"><div className="sp"><Icon icon={Sparkles} className="ico" /></div><div><div className="at">Compare with Scout</div><div className="as">Ranks the shortlist against your group's criteria</div></div></div>
      {caveats.length > 0 && <div className="crit">{caveats.slice(0, 6).map((c) => <span key={c.id} className="c">{c.text}</span>)}</div>}
      <div className="acts">
        <button className="btn btn-primary btn-sm" onClick={() => { if (requireSignIn('compare with Scout')) void compare.runWhole(shortlist); }} disabled={!shortlist.length || compare.running}><Icon icon={Sparkles} className="ico" /> {compare.running ? 'Thinking…' : `Ask Scout (${shortlist.length})`}</button>
        {selected.size >= 2
          ? <button className="btn btn-ghost btn-sm" onClick={() => void compare.runSelected(selected.size === 2 ? '1v1' : 'multi')} disabled={compare.running}><Icon icon={Swords} className="ico" /> Compare {selected.size}</button>
          : <button className="btn btn-ghost btn-sm" disabled><Icon icon={Swords} className="ico" /> 1v1 · pick 2</button>}
      </div>
      <div className="ai-ask">
        <input className="field" value={askQ} onChange={(e) => setAskQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void askScout(); }} placeholder="Ask Scout your own question…" disabled={askBusy} />
        <button className="btn btn-primary btn-sm" onClick={() => void askScout()} disabled={askBusy || !askQ.trim()} aria-label="Ask Scout"><Icon icon={Send} className="ico" /></button>
      </div>
      {askAns && (
        <div className="ai-answer">
          <div className="ai-answer-h"><Icon icon={Sparkles} className="ico" /> Just for you <span>private</span><button onClick={() => setAskAns(null)} aria-label="Dismiss"><Icon icon={X} className="ico" /></button></div>
          <Markdown text={askAns} />
        </div>
      )}
    </div>
  );

  const shortlistView = (
    <div className="sec">
      <div className="sec-h"><span className="t">Group's Shortlist</span><span className="c tnum">{shortlist.length}</span></div>
      <div className="sec-sub">Net-likes ≥ 1 · rises automatically from the group's votes</div>
      {aiCard}
      {/* Scout's persisted whole-shortlist analysis — same data the desktop
          Insights drawer shows, so the group's verdict isn't desktop-only. */}
      {insights?.analysis && (
        <details style={{ marginTop: 12, background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '12px 15px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon icon={Sparkles} className="ico" style={{ color: 'var(--accent-text)' }} /> Scout's last analysis
          </summary>
          <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-2)' }}><ScoutVerdict verdict={insights.verdict} fallback={insights.analysis} /></div>
        </details>
      )}
      {shortlist.length
        ? <div className="list" style={{ marginTop: 16 }}>{shortlist.map((l) => mcard(l))}</div>
        : <div className="empty"><div className="ec"><Icon icon={Star} className="ico" /></div><h3>No finalists yet</h3><p>Homes rise here once they reach <b>net +1</b> likes.</p><button className="btn btn-primary" onClick={() => setView('home')}><Icon icon={Home} className="ico" /> Browse homes</button></div>}
    </div>
  );

  const savedView = (
    <div className="sec">
      <div className="sec-h"><span className="t">Saved</span>{savedItems.length > 0 && <span className="c tnum">{savedItems.length}</span>}</div>
      <div className="sec-sub">Private to you · bookmarked homes only you can see</div>
      {savedItems.length >= 2 && (
        <div className="ai-card">
          <div className="ah"><div className="sp"><Icon icon={Sparkles} className="ico" /></div><div><div className="at">Ask Scout · for me</div><div className="as">Ranks your saved homes by your priorities · private, doesn't touch the group</div></div></div>
          <div className="acts">
            <button className="btn btn-primary btn-sm" onClick={() => { if (requireSignIn('rank your saved')) void compare.runWhole(savedItems); }} disabled={compare.running}><Icon icon={Sparkles} className="ico" /> {compare.running ? 'Thinking…' : `Rank my ${savedItems.length} saved`}</button>
            {selected.size >= 2 && <button className="btn btn-ghost btn-sm" onClick={() => void compare.runSelected(selected.size === 2 ? '1v1' : 'multi')} disabled={compare.running}><Icon icon={Swords} className="ico" /> Compare {selected.size}</button>}
          </div>
        </div>
      )}
      {savedItems.length
        ? <div className="list" style={{ marginTop: 8 }}>{savedItems.map((l) => mcard(l))}</div>
        : <div className="empty"><div className="ec"><Icon icon={Bookmark} className="ico" /></div><h3>Nothing saved yet</h3><p>Tap the bookmark on any home to keep your own private shortlist.</p><button className="btn btn-primary" onClick={() => setView('home')}><Icon icon={Home} className="ico" /> Browse homes</button></div>}
    </div>
  );

  // "Things to do" — Airbnb Experiences near the destination, votable like homes.
  // Spec: docs/specs/experiences.md (Phase 1). Sorted most-wanted → best-rated.
  // Phase 2.2: once the decision is locked, distances anchor on the chosen home
  // (its coords when scraped, else the trip's primary ref point) + Nearest sort.
  const expAnch = final.decision ? expAnchor(findListing(final.decision.listing_id), trip) : null;
  const expDist = (x: (typeof experiences)[number]) => expDistanceMi(expAnch, x);
  // ONE predicate context, shared by the list and the sheet's counts.
  const expPredCtx = { split, dist: expDist };
  // Selecting is only "on" when you can actually see the cards you're picking.
  const expSelecting = expPickMode && view === 'todo' && expView === 'browse';
  const expActiveFilters = Object.keys(expFilters).filter((k) => expFilters[k] && EXP_PREDS[k]);
  let expPool = expVibe ? experiences.filter((x) => expMatchesVibe(x, expVibe)) : experiences;
  if (expSavedOnly) expPool = expPool.filter((x) => expSaved.has(x.id));
  // AND across the quick filters: each one narrows, none of them widen.
  for (const k of expActiveFilters) expPool = expPool.filter((x) => EXP_PREDS[k].test(x, expPredCtx));
  /** How many of the CURRENTLY VISIBLE set a filter would leave — counted with
   *  the same predicate that does the filtering, against the same pool the user
   *  is looking at, so the number is a promise rather than a trivium. */
  const expCountIf = (k: string) => {
    let pool = expVibe ? experiences.filter((x) => expMatchesVibe(x, expVibe)) : experiences;
    if (expSavedOnly) pool = pool.filter((x) => expSaved.has(x.id));
    for (const o of expActiveFilters) if (o !== k) pool = pool.filter((x) => EXP_PREDS[o].test(x, expPredCtx));
    return pool.filter((x) => EXP_PREDS[k].test(x, expPredCtx)).length;
  };
  const expVibesAvail = EXP_VIBES.map((v) => ({ ...v, n: experiences.filter((x) => expMatchesVibe(x, v.key)).length })).filter((v) => v.n >= 2);
  const sortedExp = [...expPool].sort((a, b) =>
    expNearest && expAnch
      ? ((expDist(a) ?? Infinity) - (expDist(b) ?? Infinity)) || ((b.rating ?? 0) - (a.rating ?? 0))
      : (expTally(expVotes, b.id, user?.id ?? null).net - expTally(expVotes, a.id, user?.id ?? null).net) ||
        ((b.rating ?? 0) - (a.rating ?? 0)) ||
        ((a.price ?? Infinity) - (b.price ?? Infinity)));
  // ── Personal lane on mobile (parity with the desktop To-do tab): saves,
  //    select-for-Scout, my own plan, share + PDF. Sharing a plan into the group
  //    chat is a phone behaviour above all, so it must live here. ──────────────
  const expLeaders = expGroupList(experiences, expVotes, user?.id ?? null);
  // Support is measured against the PARTY, never the current leader — measuring
  // against the leader made the first vote fill the row 100%, which teaches
  // people the number is fake. Same fix as the desktop tab.
  const expVoterCount = useMemo(() => {
    const who = new Set<string>();
    for (const byUser of Object.values(expVotes)) for (const uid of Object.keys(byUser)) who.add(uid);
    return who.size;
  }, [expVotes]);
  const expById = new Map(experiences.map((x) => [x.id, x]));
  const toggleExpSave = async (id: string) => {
    if (!trip || !requireSignIn('save this')) return;
    const prev = new Set(expSaved);
    const next = new Set(expSaved);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpSaved(next);
    try {
      const r = await api.toggleExpSave(trip.id, id, next.has(id));
      setExpSaved(new Set(r.ids));
      track('experience_saved', { experience_id: id, on: next.has(id), surface: 'mobile' });
    } catch (e) {
      setExpSaved(prev);
      toast(e instanceof Error ? e.message : 'Could not save that.', 'error');
    }
  };
  /** `only` is the reviewed, kept slice — so what the review showed dimmed is
   *  exactly what doesn't arrive, rather than the server silently slicing. */
  const buildMyExpPlan = async (only?: string[]) => {
    if (!trip || expPlanning) return;
    if (!requireSignIn('plan your days')) return;
    const ids = only?.length ? only : (expPicked.size ? [...expPicked] : [...expSaved]);
    if (!ids.length) { toast('Save or select a few things first.', 'error'); return; }
    setExpPlanning(true);
    try {
      const p = await api.buildMyPlan(trip.id, ids);
      setMyExpPlan(p);
      track('my_plan_built', { count: ids.length, fallback: !!p.fallback, surface: 'mobile' });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Scout could not plan that.', 'error');
    } finally { setExpPlanning(false); }
  };
  const todoView = (
    <div className="sec">
      <div className="sec-h">
        <span className="t">Things to do</span>{sortedExp.length > 0 && <span className="c tnum">{sortedExp.length}</span>}
        {expAnch && (
          <button
            className={cn('btn btn-sm', expNearest ? 'btn-primary' : 'btn-ghost')}
            style={{ marginLeft: 'auto' }}
            onClick={() => setExpNearest((n) => !n)}
            title={`Sort by distance from ${expAnch.label}`}
          >
            <Icon icon={MapPin} className="ico" /> Nearest
          </button>
        )}
      </div>
      <div className="sec-sub">near {trip?.destination} · vote for what you&rsquo;d actually do — booking happens on Airbnb</div>
      <div className="xseg" role="tablist" aria-label="Things to do view" style={{ margin: '10px 0 0' }}>
        <button role="tab" aria-selected={expView === 'browse'} className={cn(expView === 'browse' && 'on')} onClick={() => setExpView('browse')}>
          <Icon icon={Compass} className="ico" /> Browse <span className="n tnum">{sortedExp.length}</span>
        </button>
        <button role="tab" aria-selected={expView === 'plan'} className={cn(expView === 'plan' && 'on')}
          onClick={() => { setExpView('plan'); track('experiences_view', { view: 'plan', surface: 'mobile' }); }}>
          <Icon icon={CalendarDays} className="ico" /> Plan
          {expView !== 'plan' && myExpPlan?.days.length ? <span className="dot" /> : null}
        </button>
      </div>
      {/* The chip row. It used to be gated on `expVibesAvail.length > 1`, which
          meant a trip with few categories hid the row entirely — and with it
          the ONLY door into the plan flow. The plan action is not a filter and
          must not share a filter's visibility condition. It now leads the row
          as the one accent-filled chip, per the handoff's "two obvious doors". */}
      {expView === 'browse' && (
        <div className="fchips" style={{ marginTop: 8 }}>
          {user && (
            <button className={cn('fchip', 'xm-mk', expPickMode && 'on')}
              onClick={() => { setExpPickMode((v) => !v); if (!expPickMode) track('experiences_pickmode_on', { surface: 'mobile' }); }}>
              <Icon icon={expPickMode ? Check : Sparkles} className="ico" /> {expPickMode ? 'Done picking' : 'Make a plan'}
            </button>
          )}
          <button className={cn('fchip', expActiveFilters.length > 0 && 'on')} onClick={() => setExpSheet(true)} aria-haspopup="dialog">
            <Icon icon={SlidersHorizontal} className="ico" /> Filters
            {expActiveFilters.length > 0 && <span className="c tnum">{expActiveFilters.length}</span>}
          </button>
          <button className={cn('fchip', !expVibe && !expSavedOnly && expActiveFilters.length === 0 && 'on')} onClick={() => { setExpVibe(null); setExpSavedOnly(false); setExpFilters({}); }}>All {experiences.length}</button>
          {user && expSaved.size > 0 && (
            <button className={cn('fchip', expSavedOnly && 'on')} onClick={() => setExpSavedOnly((v) => !v)}>
              <Icon icon={Bookmark} className="ico" /> Saved <span className="c tnum">{expSaved.size}</span>
            </button>
          )}
          {expVibesAvail.map((v) => (
            <button key={v.key} className={cn('fchip', expVibe === v.key && 'on')} onClick={() => { const n = expVibe === v.key ? null : v.key; setExpVibe(n); if (n) track('experiences_vibe_filtered', { vibe: n, surface: 'mobile' }); }}>
              {v.label} <span className="c tnum">{v.n}</span>
            </button>
          ))}
        </div>
      )}
      {/* Live leaderboard: liked experiences ranked by net likes, reordering as
          votes land. Same beat as the desktop tab (and the homes top-choice board). */}
      {/* At zero votes this used to render nothing at all, so the one surface
          that explains how the group decides was invisible exactly when someone
          needed to learn it. An empty leaderboard teaches; it doesn't hide. */}
      {expView === 'plan' && expLeaders.length === 0 && experiences.length > 0 && (
        <div className="xlb xlb-teach" style={{ marginTop: 10 }}>
          <span className="ic"><Icon icon={ThumbsUp} className="ico" /></span>
          <b>Nothing has risen yet</b>
          <p>
            Anything the group net-likes shows up here, ranked, with a bar for how much of
            the party wants it. One vote of {split} fills a {Math.round(100 / Math.max(1, split))}% sliver —
            that&rsquo;s deliberate, so a single yes never reads as agreement.
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => setExpView('browse')}>
            <Icon icon={Compass} className="ico" /> Start voting
          </button>
        </div>
      )}
      {expView === 'plan' && expLeaders.length > 0 && (
        <div className="xlb" style={{ marginTop: 10 }}>
          <div className="xlb-head">
            <span className="xlb-title">Top of the list</span>
            <span className="xlb-sub">{expLeaders.length} in the running</span>
          </div>
          <ol className="xlb-rows">
            {expLeaders.map((x, i) => {
              const tl = expTally(expVotes, x.id, user?.id ?? null);
              return (
                <li key={x.id}>
                  <button
                    className={cn('xlb-row', i === 0 && 'lead')}
                    style={{ ['--pct' as string]: `${Math.max(0, Math.min(100, (tl.net / Math.max(1, split)) * 100)).toFixed(1)}%` }}
                    onClick={() => { setExpOpen(x); track('experience_detail_opened', { experience_id: x.id, surface: 'leaderboard_mobile' }); }}
                  >
                    <span className="xlb-rk">{i + 1}</span>
                    {x.photo ? <img className="xlb-thumb" src={x.photo} alt="" loading="lazy" /> : <span className="xlb-thumb" />}
                    <span className="xlb-main"><span className="xlb-name">{x.title}</span></span>
                    <span className="xlb-likes tnum">{tl.net} <small>of {split}</small></span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="xlb-quorum">
            <Icon icon={Users} className="ico" />
            <span><b className="tnum">{expVoterCount}</b> of {split} have voted</span>
            <span className="track"><span className="fill" style={{ width: `${Math.min(100, (expVoterCount / Math.max(1, split)) * 100)}%` }} /></span>
          </div>
        </div>
      )}
      {expView === 'plan' && user && (expSaved.size > 0 || expPicked.size > 0 || myExpPlan) && (
        <div className="ai-card" style={{ marginTop: 10 }}>
          <div className="ah">
            <div className="sp"><Icon icon={Bookmark} className="ico" /></div>
            <div>
              <div className="at">My plan</div>
              <div className="as">
                {expPicked.size > 0
                  ? `${expPicked.size} selected — Scout plans exactly these`
                  : myExpPlan
                    ? `${myExpPlan.days.reduce((n, d) => n + d.items.length, 0)} activities · private to you`
                    : `${expSaved.size} saved · private to you`}
              </div>
            </div>
          </div>
          {myExpPlan && myExpPlan.days.length > 0 && (
            <div className="xplan">
              {/* Closed panels say something. "4 days · 6 activities · $253 pp"
                  plus the thumbnails beats a collapsed panel showing nothing. */}
              <PanelDigest
                facts={[
                  `${myExpPlan.days.length} ${myExpPlan.days.length === 1 ? 'day' : 'days'}`,
                  `${myExpPlan.days.reduce((k, d) => k + d.items.length, 0)} activities`,
                  ...(expPlanPerPerson(myExpPlan, expById, split) != null ? [`$${expPlanPerPerson(myExpPlan, expById, split)} pp`] : []),
                ]}
                photos={myExpPlan.days.flatMap((d) => d.items.map((it) => expById.get(it.id)?.photo))}
              />
              {myExpPlan.days.map((d, di) => (
                d.route && d.route.rows.length > 0 ? (
                  /* The same routed day the desktop got: clock times, drives,
                     and the house bookends folded into their adjoining leg. The
                     phone had a flat list of names — no times, no drives, no
                     sense that the day was a sequence at all. */
                  <RoutedDay
                    key={di}
                    day={d.day}
                    route={d.route}
                    byId={expById}
                    onOpen={(x) => setExpOpen(x)}
                    open={expMineDays.isOpen(di)}
                    onToggle={() => expMineDays.toggle(di)}
                  />
                ) : (
                  /* No coordinates means no route — say what we have rather
                     than invent times. Gaps get named, not filled. */
                  <div className="xplan-day" key={di}>
                    <div className="xplan-dh">{d.day ? new Date(`${d.day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Any day'}</div>
                    {d.items.map((it) => {
                      const x = expById.get(it.id);
                      if (!x) return null;
                      return (
                        <button key={it.id} className="xplan-it" onClick={() => setExpOpen(x)}>
                          {x.photo ? <img src={x.photo} alt="" loading="lazy" /> : <span className="ph" />}
                          <span className="tx"><b>{x.title}</b><small>{[x.price != null ? `$${x.price}/${x.priceUnit === 'group' ? 'group' : 'guest'}` : null, x.duration != null ? fmtMins(x.duration) : null].filter(Boolean).join(' · ')}</small></span>
                        </button>
                      );
                    })}
                  </div>
                )
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => void buildMyExpPlan()} disabled={expPlanning} style={{ flex: 1 }}>
              <Icon icon={Sparkles} className="ico" /> {expPlanning ? 'Planning…' : myExpPlan ? 'Re-plan mine' : 'Plan my days'}
            </button>
            {myExpPlan && trip && user && (
              <a className="btn btn-ghost btn-sm" href={`/s/plan/${encodeURIComponent(trip.id)}/${encodeURIComponent(user.id)}.pdf`} onClick={() => track('my_plan_pdf', { surface: 'mobile' })}>
                PDF
              </a>
            )}
            {myExpPlan && (
              <button className="btn btn-primary btn-sm" onClick={() => setExpShareSheet(true)} style={{ flex: 1 }}>
                <Icon icon={Share2} className="ico" /> Share
              </button>
            )}
          </div>
        </div>
      )}

      {expView === 'browse' && (sortedExp.length ? (
        <div className="list" style={{ marginTop: 8 }}>
          {sortedExp.map((x) => {
            const tl = expTally(expVotes, x.id, user?.id ?? null);
            const mi = expDist(x);
            return (
              <article
                key={x.id}
                className={cn('mcard', expPickMode && 'pickmode', expPicked.has(x.id) && 'picked')}
                role="button"
                tabIndex={0}
                {...tap.bind(() => {
                  if (expPickMode) { setExpPicked((s0) => { const nx = new Set(s0); nx.has(x.id) ? nx.delete(x.id) : nx.add(x.id); return nx; }); return; }
                  setExpOpen(x); track('experience_detail_opened', { experience_id: x.id, surface: 'mobile' });
                })}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setExpOpen(x); track('experience_detail_opened', { experience_id: x.id, surface: 'mobile' }); } }}
              >
                <div className="ph">
                  <MobilePhotoCarousel photos={x.photo ? [x.photo] : []} alt={x.title}>
                    {/* One urgency badge, never metadata — same budget as desktop. */}
                    {x.originalPrice != null && x.price != null && x.originalPrice > x.price ? (
                      <span className="xrib save"><Icon icon={Tag} className="ico" /> Save ${x.originalPrice - x.price}</span>
                    ) : x.priceUnit === 'group' ? (
                      <span className="xrib group"><Icon icon={UsersRound} className="ico" /> Group rate</span>
                    ) : null}
                    {/* Save is the only overlay. Selecting for Scout is a MODE — two
                        near-identical circles was the desktop bug too. */}
                    <button className={cn('save', expSaved.has(x.id) && 'on')}
                      onClick={(e) => { e.stopPropagation(); void toggleExpSave(x.id); }}
                      aria-label={expSaved.has(x.id) ? 'Saved to your list' : 'Save to your list'}>
                      <Icon icon={Bookmark} className="ico" />
                    </button>
                    {expPickMode && (
                      <span className={cn('pickbox', expPicked.has(x.id) && 'on')} aria-hidden="true"><Icon icon={Check} className="ico" /></span>
                    )}
                  </MobilePhotoCarousel>
                </div>
                <div className="info">
                  <div className="row1">
                    <span className="nm">{x.title}</span>
                    {x.rating != null && <span className="rt"><Icon icon={Star} className="ico" /> {x.rating}</span>}
                  </div>
                  <div className="sub">
                    {[
                      x.category,
                      x.duration != null ? fmtMins(x.duration) : null,
                      mi != null ? `${mi} mi from ${expAnch!.label}` : null,
                    ].filter(Boolean).join(' · ') || 'Experience'}
                  </div>
                  {expDayPins[x.id] && (
                    <span className="xpin" style={{ marginTop: 6 }}>
                      <Icon icon={CalendarDays} className="ico" /> Pinned
                    </span>
                  )}
                  <div className="pr">
                    <ExpPrice x={x} split={split} />
                  </div>
                </div>
                {/* The vote footer states its own denominator ONCE. The old row
                    said "3 of 14 would go" on one line and then "+3" on the
                    next — the same fact twice, in two scales, with 30px thumb
                    targets between them. One tally, two 44px thumbs. Hidden in
                    pick mode: you're choosing, not judging. */}
                {!expPickMode && (
                  <div className="xm-vote" onClick={(e) => e.stopPropagation()}>
                    <span className="xm-tally">
                      <span className={cn('n tnum', tl.net > 0 && 'pos')}>{tl.net > 0 ? `+${tl.net}` : tl.net}</span>
                      <span className="l">of {split} would go</span>
                    </span>
                    <span className="xm-acts">
                      <button className={cn('xm-vbtn up', tl.mine === 'up' && 'on')} aria-pressed={tl.mine === 'up'} aria-label="Want to do this"
                        onClick={() => { void castExpVote(x.id, 'up'); track('experience_voted', { experience_id: x.id, dir: 'up' }); }}>
                        <Icon icon={ThumbsUp} className="ico" />
                      </button>
                      <button className={cn('xm-vbtn down', tl.mine === 'down' && 'on')} aria-pressed={tl.mine === 'down'} aria-label="Not for me"
                        onClick={() => { void castExpVote(x.id, 'down'); track('experience_voted', { experience_id: x.id, dir: 'down' }); }}>
                        <Icon icon={ThumbsDown} className="ico" />
                      </button>
                    </span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        /* Four situations, never conflated — the phone kept the old two-state
           version (pending vs "nothing here") months after the desktop was
           split, so a server outage read as "we couldn't find anything for
           your trip" and a narrow chip read as an empty destination. Same
           component as the desktop tab now, so they can't drift again. */
        <ExperienceStates
          className="xstate xm-state"
          state={expListState({ total: experiences.length, shown: sortedExp.length, pending: expPending, failed: expFailed }) ?? 'empty'}
          destination={trip?.destination}
          total={experiences.length}
          filterLabel={expSavedOnly && !expVibe ? 'your saved list' : `\u201c${EXP_VIBES.find((v) => v.key === expVibe)?.label ?? 'that vibe'}\u201d`}
          onRetry={() => void retryExperiences()}
          onLookAgain={() => void refreshExperiences()}
          onClearFilters={() => { setExpVibe(null); setExpSavedOnly(false); setExpFilters({}); }}
        />
      ))}
      {expSelecting && (
        <div className="xpickbar">
          <span className="cnt tnum">{expPicked.size} <span>selected</span></span>
          {expPicked.size > 0 && <button className="lnk" onClick={() => setExpPicked(new Set())}>Clear</button>}
          {/* Evidence precedes commitment: you see what these picks add up to
              — and what won't fit — before Scout spends a minute on them. */}
          <button className="btn btn-primary btn-sm" disabled={expPicked.size === 0}
            onClick={() => setExpReview(true)}>
            <Icon icon={Sparkles} className="ico" /> Review &amp; generate
          </button>
        </div>
      )}
      {expSheet && (
        <div className="xm-scrim" role="dialog" aria-modal="true" aria-label="Filter things to do" onClick={() => setExpSheet(false)}>
          <div className="xm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="xm-grab" aria-hidden="true" />
            <div className="xm-shead">
              <h3>Narrow it down</h3>
              <button className="lnk" onClick={() => setExpFilters({})} disabled={expActiveFilters.length === 0}>Reset</button>
            </div>
            <div className="xm-sbody">
              {Object.entries(EXP_PREDS).map(([k, pred]) => {
                // `close` needs an anchor, and there isn't one until the group
                // has locked a home. Offering it early would be a filter that
                // silently matches nothing.
                if (k === 'close' && !expAnch) return null;
                const nMatch = expCountIf(k);
                const on = !!expFilters[k];
                return (
                  <button key={k} className={cn('xm-frow', on && 'on')} aria-pressed={on}
                    onClick={() => setExpFilters((f) => ({ ...f, [k]: !f[k] }))}>
                    <span className="bx" aria-hidden="true">{on && <Icon icon={Check} className="ico" />}</span>
                    <span className="tx">
                      <b>{pred.label}</b>
                      <small>{pred.hint}</small>
                    </span>
                    <span className="c tnum">{nMatch}</span>
                  </button>
                );
              })}
            </div>
            <div className="xm-sfoot">
              <button className="btn btn-primary" onClick={() => setExpSheet(false)}>
                Show {sortedExp.length} {sortedExp.length === 1 ? 'thing' : 'things'} to do
              </button>
            </div>
          </div>
        </div>
      )}
      {expReview && (() => {
        // The two caps the server actually applies, surfaced rather than hidden.
        // POST /my-plan slices to 12 and Scout packs at most 2 a day, so the
        // real ceiling is whichever bites first. Anything past it was being
        // dropped in silence — the user picked it and never learned it was gone.
        const PER_DAY = 2, HARD_CAP = 12;
        const dayCap = expTripDays.length ? expTripDays.length * PER_DAY : HARD_CAP;
        const ceiling = Math.min(HARD_CAP, dayCap);
        const ordered = [...expPicked].map((id) => expById.get(id)).filter((x): x is Experience => !!x);
        const kept = ordered.slice(0, ceiling);
        const spill = ordered.slice(ceiling);
        // Totals count the KEPT slice only. Summing the spill would promise a
        // day that isn't going to exist.
        const mins = kept.reduce((k, x) => k + (x.duration || 0), 0);
        const pp = kept.reduce((k, x) => k + (x.price != null ? (x.priceUnit === 'group' ? x.price / Math.max(1, split) : x.price) : 0), 0);
        const daysNeeded = Math.max(1, Math.ceil(kept.length / PER_DAY));
        const row = (l: string, v: React.ReactNode) => (
          <div className="xm-sumrow"><span className="l">{l}</span><span className="v tnum">{v}</span></div>
        );
        return (
          <div className="xm-full" role="dialog" aria-modal="true" aria-label="Build a plan">
            <div className="xm-fullhead">
              <button className="xm-back" onClick={() => setExpReview(false)} aria-label="Back"><Icon icon={ChevronLeft} className="ico" /></button>
              <h3>Build a plan</h3>
            </div>
            <div className="xm-fullbody">
              <ol className="xm-picklist">
                {ordered.map((x, i) => {
                  const over = i >= ceiling;
                  return (
                    <li key={x.id} className={cn('xm-pickrow', over && 'over')}>
                      <span className="rk tnum">{i + 1}</span>
                      {x.photo ? <img src={x.photo} alt="" loading="lazy" decoding="async" /> : <span className="ph" />}
                      <span className="tx">
                        <b>{x.title}</b>
                        <small>{[x.duration != null ? fmtMins(x.duration) : null, x.category].filter(Boolean).join(' \u00b7 ') || 'Experience'}</small>
                      </span>
                      {over && <span className="wont">Won&rsquo;t fit</span>}
                      <button className="rm" aria-label={`Remove ${x.title}`}
                        onClick={() => setExpPicked((s0) => { const nx = new Set(s0); nx.delete(x.id); return nx; })}>
                        <Icon icon={X} className="ico" />
                      </button>
                    </li>
                  );
                })}
              </ol>

              {spill.length > 0 && (
                <p className="xm-spill">
                  {expTripDays.length
                    ? <>Your trip is <b>{expTripDays.length} {expTripDays.length === 1 ? 'day' : 'days'}</b>, and Scout plans at most {PER_DAY} things a day — so {spill.length} of these {spill.length === 1 ? 'has' : 'have'} nowhere to go. Remove something to make room.</>
                    : <>Scout plans up to {HARD_CAP} things, so {spill.length} of these won&rsquo;t make it in. Remove something to make room.</>}
                </p>
              )}

              <div className="xm-sum">
                {row('Activities', spill.length ? `${kept.length} of ${ordered.length}` : `${kept.length}`)}
                {row('Days it needs', expTripDays.length ? `${daysNeeded} of ${expTripDays.length}` : `${daysNeeded}`)}
                {mins > 0 && row('Time on activities', fmtMins(mins))}
                {pp > 0 && row('Per person, from', `$${Math.ceil(pp)}`)}
                {/* No invented driving figure. We don't know the route until the
                    server builds it, and a number here that changes after you
                    press the button is worse than no number. */}
                {row('Driving', <span className="soft">worked out when Scout routes it</span>)}
              </div>

              <div className="xm-mkintro">
                <span className="mk"><Icon icon={Sparkles} className="ico" /></span>
                <div>
                  <b>What Scout does next</b>
                  <p>
                    Orders these by where they are so you aren&rsquo;t crossing town twice, fits them to your dates,
                    and starts and ends each day at the house. It won&rsquo;t add anything you didn&rsquo;t pick, and it
                    says so when an evening is empty rather than filling it.
                  </p>
                </div>
              </div>
            </div>
            <div className="xm-fullfoot">
              <button className="btn btn-ghost" onClick={() => setExpReview(false)}>Keep picking</button>
              <button className="btn btn-primary" disabled={expPlanning || kept.length === 0}
                onClick={async () => {
                  // Send exactly the kept slice, so what was shown dimmed is
                  // what actually doesn't arrive.
                  await buildMyExpPlan(kept.map((x) => x.id));
                  setExpReview(false); setExpPickMode(false); setExpView('plan');
                }}>
                <Icon icon={Sparkles} className="ico" /> {expPlanning ? 'Planning\u2026' : `Generate ${daysNeeded} ${daysNeeded === 1 ? 'day' : 'days'}`}
              </button>
            </div>
          </div>
        );
      })()}
      {expShareSheet && trip && user && (() => {
        const url = `${window.location.origin}/s/plan/${encodeURIComponent(trip.id)}/${encodeURIComponent(user.id)}`;
        const left = expPlanDaysLeft(myExpPlan);
        const off = left === 0;
        const setLink = async (on: boolean) => {
          if (expLinkBusy) return;
          setExpLinkBusy(true);
          try {
            setMyExpPlan(on ? await api.reshareMyPlan(trip.id) : await api.revokeMyPlan(trip.id));
            toast(on ? 'Link is live again for 7 days.' : 'Link turned off. Anyone who opens it now sees that it expired.', 'success');
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Could not change the link.', 'error');
          } finally { setExpLinkBusy(false); }
        };
        return (
          <div className="xm-scrim" role="dialog" aria-modal="true" aria-label="Share your plan" onClick={() => setExpShareSheet(false)}>
            <div className="xm-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="xm-grab" aria-hidden="true" />
              <div className="xm-shead"><h3>{off ? 'Link is off' : 'Share your plan'}</h3></div>
              <div className="xm-sbody">
                {/* The link is the product of this screen, so show the actual
                    URL rather than only a Copy button — people want to see what
                    they're about to paste into a group chat. */}
                <div className={cn('xm-linkbox', off && 'is-off')}>
                  <Icon icon={off ? Link2Off : Link2} className="ico" />
                  <span className="u">{url.replace(/^https?:\/\//, '')}</span>
                </div>
                <p className="xm-linknote">
                  {off
                    ? 'Anyone opening this link now sees that it expired. Your plan is untouched — turn it back on and it works again.'
                    : left != null
                      ? <>Anyone with the link can read it — no account needed. It stops working in <b>{left} day{left === 1 ? '' : 's'}</b>.</>
                      : <>Anyone with the link can read it — no account needed.</>}
                </p>
                <div className="xm-linkacts">
                  {!off && (
                    <button className="btn btn-primary" onClick={async () => {
                      try {
                        if (navigator.share) await navigator.share({ title: 'My plan', url });
                        else { await navigator.clipboard.writeText(url); toast('Link copied — paste it in the group chat.', 'success'); }
                        track('my_plan_shared', { surface: 'mobile' });
                      } catch { /* dismissed */ }
                    }}><Icon icon={Share2} className="ico" /> Send the link</button>
                  )}
                  {/* Seeing the watermarked page before sending it is the whole
                      reason people trust sharing a draft. */}
                  {!off && (
                    <a className="btn" href={url} target="_blank" rel="noopener noreferrer">
                      <Icon icon={Eye} className="ico" /> Preview as your group sees it
                    </a>
                  )}
                  <button className={cn('btn', off ? 'btn-primary' : 'btn-ghost')} disabled={expLinkBusy}
                    onClick={() => void setLink(off)}>
                    <Icon icon={off ? Link2 : Link2Off} className="ico" />
                    {expLinkBusy ? 'Working…' : off ? 'Turn the link back on' : 'Turn the link off'}
                  </button>
                </div>
              </div>
              <div className="xm-sfoot">
                <button className="btn btn-ghost" onClick={() => setExpShareSheet(false)}>Done</button>
              </div>
            </div>
          </div>
        );
      })()}
      {expOpen && (
        <ExperienceModal x={expOpen} dist={expDist(expOpen)} anchorLabel={expAnch?.label} onClose={() => setExpOpen(null)} />
      )}
    </div>
  );

  const decisionView = (
    <div className="sec">
      <div className="sec-h"><span className="t">Decision</span></div>
      <div className="sec-sub">Where the group is landing · one official pick when you're ready</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
        {official && (
          <div className="official-banner"><div className="seal"><Icon icon={BadgeCheck} className="ico" /></div>
            <div style={{ flex: 1, minWidth: 0 }}><div className="k"><span className="gd" /> Official pick · locked</div>
              <div className="nm">{shortName(official.name)}</div>
              <div className="mt"><span className="tnum">{fmt(official.est_5n)} all-in</span><span className="tnum">{ppOf(official)}/person</span></div></div>
            {isOwner && <button className="btn btn-sm" onClick={() => void setDecision(null)}><Icon icon={Lock} className="ico" /></button>}
          </div>
        )}
        <div className="lb">
          <div className="lb-h"><span className="t">Group decision</span><span className="s">one ⭐ each · visible to all</span></div>
          <div className="lb-prog"><span><Icon icon={Users} className="ico" /> Top-choice votes in</span><b className="tnum">{votedCount} of {groupTotal}</b></div>
          <div className="ptrack"><div className="pfill" style={{ width: `${pct}%` }} /></div>
          <div style={{ marginTop: 6 }}>
            {(shortlist.length ? shortlist : pooledListings).slice().sort((a, b) => (final.counts?.[b.id] || 0) - (final.counts?.[a.id] || 0)).slice(0, 4).map((l, i) => {
              const tv = final.counts?.[l.id] || 0; const max = Math.max(5, ...shortlist.map((x) => final.counts?.[x.id] || 0));
              return (
                <div key={l.id} className={cn('lb-bar', i === 0 && 'lead')}>
                  <span className="rk tnum">{i + 1}</span>
                  <div>
                    <div className="nm">{i === 0 && <Icon icon={Star} className="ico" />}{shortName(l.name)}</div>
                    <div className="tk"><div className="f" style={{ width: `${Math.max(7, (tv / max) * 100)}%` }} /></div>
                    {(() => { const who = (final.pickers?.[l.id] ?? []).map((uid) => roster.find((m) => m.id === uid)).filter((m): m is NonNullable<typeof m> => !!m); return who.length > 0 && (
                      <span className="vote-who" style={{ marginTop: 5 }} title={`Picked by ${who.map((m) => m.name).join(', ')}`}>
                        {who.slice(0, 5).map((m) => <span className="vw-av" key={m.id}><Avatar name={m.name} avatar={m.avatar} size={19} /></span>)}
                        {who.length > 5 && <span className="vw-more tnum">+{who.length - 5}</span>}
                      </span>
                    ); })()}
                  </div>
                  <span className="tl tnum">{tv} <span>votes</span></span>
                </div>
              );
            })}
          </div>
          {leader && (isOwner
            ? (final.total > 0
                ? <button className="btn btn-primary" style={{ width: '100%', marginTop: 14 }} onClick={() => void setDecision(leader.id)}><Icon icon={BadgeCheck} className="ico" /> Make “{shortName(leader.name)}” official</button>
                : <button className="btn btn-ghost" style={{ width: '100%', marginTop: 14, opacity: 0.6 }} disabled><Icon icon={BadgeCheck} className="ico" /> Waiting on top choices</button>)
            : <button className="btn btn-ghost" style={{ width: '100%', marginTop: 14 }} onClick={() => { if (requireSignIn('cast your top choice')) void toggleFinalPick(leader.id); }}><Icon icon={Star} className="ico" /> Cast my top choice</button>)}
        </div>
        {aiCard}
      </div>
    </div>
  );

  const [draft, setDraft] = useState('');
  const chatView = (
    <div className="sec">
      <div className="sec-h"><span className="t">Discussion</span><span className="c tnum">{caveats.length}</span></div>
      <div className="sec-sub">Must-haves &amp; dealbreakers · these feed Scout's ranking</div>
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', margin: '8px 0 4px' }} onClick={() => startOnboarding(true)}><Icon icon={HelpCircle} className="ico" /> Show me around · replay the tour</button>
      <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '4px 15px', marginTop: 4 }}>
        {caveats.map((c) => {
          const pending = (c.status ?? 'approved') !== 'approved';
          return (
            <div key={c.id} className="cv"><span className="av">{(c.name || '?').slice(0, 1)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="who">{c.name}{pending && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--star-strong, #b8860b)', background: 'var(--star-bg)', padding: '2px 7px', borderRadius: 'var(--r-pill)' }}>Pending</span>}</div>
                <div className="txt">{c.text}</div>
              </div>
              {pending && isOwner && (
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <button className="iconbtn" style={{ width: 32, height: 32 }} aria-label="Approve" title="Approve · Scout will weigh it" onClick={() => void approveCaveat(c.id)}><Icon icon={Check} className="ico" style={{ color: 'var(--under)' }} /></button>
                  <button className="iconbtn" style={{ width: 32, height: 32 }} aria-label="Reject" title="Reject" onClick={() => void deleteCaveat(c.id)}><Icon icon={X} className="ico" style={{ color: 'var(--over)' }} /></button>
                </span>
              )}
            </div>
          );
        })}
        {!caveats.length && <div className="txt" style={{ padding: '12px 0', color: 'var(--text-muted)' }}>No criteria yet. Add the group's must-haves below.</div>}
      </div>
      <div className="cv-post">
        <input className="field" placeholder="Add a must-have or dealbreaker…" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn btn-primary btn-icon" onClick={() => { if (draft.trim() && requireSignIn('post')) { void postCaveat(draft.trim()); setDraft(''); } }}><Icon icon={Send} className="ico" /></button>
      </div>
      {(itinerary?.text || isOwner) && (
        <>
          <div className="sec-h" style={{ marginTop: 24 }}><span className="t">Trip itinerary</span>
            {isOwner && <button className="iconbtn" style={{ marginLeft: 'auto', width: 32, height: 32 }} aria-label="Edit itinerary" onClick={() => { setItinDraft(itinerary?.text || ''); setItinEditOpen((v) => !v); }}><Icon icon={Pencil} className="ico" /></button>}
          </div>
          <ItineraryCard />
          {isOwner && (itinEditOpen || !itinerary?.text) && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                className="field"
                rows={5}
                style={{ width: '100%', resize: 'vertical', minHeight: 96 }}
                placeholder="Post the one canonical itinerary, e.g. Day 1: arrive, dinner in Santa Monica…"
                value={itinEditOpen ? itinDraft : itinDraft || ''}
                onFocus={() => { if (!itinEditOpen) { setItinDraft(itinerary?.text || ''); setItinEditOpen(true); } }}
                onChange={(e) => setItinDraft(e.target.value.slice(0, 8000))}
              />
              <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => { void saveItinerary(itinDraft); setItinEditOpen(false); }}>Save itinerary</button>
            </div>
          )}
        </>
      )}
    </div>
  );

  const navItem = (v: View, icon: typeof Home, label: string, pip?: number) => (
    <div className={cn('nav-item', view === v && 'on')} onClick={() => setView(v)}>
      <Icon icon={icon} className="ico" /><span className="lab">{label}</span>{pip != null && pip > 0 && <span className="pip tnum">{pip}</span>}
    </div>
  );

  const cmpBar = selected.size > 0 && (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(env(safe-area-inset-bottom) + 50px)', zIndex: 42, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'var(--surface-overlay)', backdropFilter: 'blur(12px)', borderTop: '1px solid var(--border)', boxShadow: '0 -6px 16px -8px rgba(0,0,0,0.18)' }}>
      <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{selected.size} to compare</span>
      <span style={{ flex: 1 }} />
      <button className="btn btn-ghost btn-sm" onClick={clearSelection}>Clear</button>
      <button className="btn btn-primary btn-sm" disabled={selected.size < 2 || compare.running} onClick={() => void compare.runSelected(selected.size === 2 ? '1v1' : 'multi')}><Icon icon={Scale} className="ico" /> Compare {selected.size}</button>
    </div>
  );

  return (
    <>
    <div className="gp-mobile">
      <div className="mb">
        <div className="tbar">
          <div className="trip-sw" onClick={() => navigate('/trips')}>
            <span className="backmk"><Icon icon={ChevronLeft} className="ico" /></span>
            <div className="nm"><div className="t">{trip?.name}</div><div className="s">{rangeLabel(trip?.checkin, trip?.checkout_5n)} · {trip?.adults} guests</div></div>
          </div>
          <span className="spacer" />
          <WhosComing compact />
          {isOwner && <span className="role-pill"><Icon icon={Crown} className="ico" /> Host</span>}
          {/* One overflow button instead of a row of icons — the top bar was
              squeezing the trip name down to "Los Angele…". Everything
              secondary (saved, theme, owner tools) lives in the More sheet. */}
          <button className="iconbtn" onClick={() => setSheet('more')} aria-label="More"><Icon icon={MoreHorizontal} className="ico" /></button>
          {!user && <button className="btn btn-primary btn-sm" style={{ marginLeft: 4, height: 34, padding: '0 12px' }} onClick={() => openAuth('sign in')}>Sign in</button>}
        </div>

        {isGuest && (
          <div className="guest-join">
            <Icon icon={UserPlus} className="ico" />
            <span>{user ? 'Join to vote, save, and add homes.' : 'Viewing as a guest. Sign in to join.'}</span>
            <button className="btn btn-primary btn-sm" onClick={joinThisTrip}>{user ? 'Join trip' : 'Sign in to join'}</button>
          </div>
        )}

        {view === 'home' && (
          <div className="fchips">
            <button className="fbtn" onClick={() => setSheet('filter')}><Icon icon={SlidersHorizontal} className="ico" /> Filters{activeFilters > 0 && <span className="dotn tnum">{activeFilters}</span>}</button>
            <SplitPill />
            {/* Only the ACTIVE filters show as chips (tap to remove) — keeps the row
                clean instead of an overflowing list of every option. */}
            {filters.under && fchip('under', 'Under budget')}
            {filters.pool && fchip('pool', 'Pool')}
            {filters.parking && fchip('parking', 'Parking')}
            {filters.hottub && fchip('hottub', 'Hot tub')}
            {filters.sleeps > 0 && <button className="fchip on" onClick={() => setFilters((f) => ({ ...f, sleeps: 0 }))}><Icon icon={Check} className="ico" /> Sleeps {filters.sleeps}+</button>}
          </div>
        )}

        <div className="mb-scroll" onScroll={markScrolling}>
          {view === 'home' && homeView}
          {view === 'shortlist' && shortlistView}
          {view === 'saved' && savedView}
          {view === 'todo' && todoView}
          {view === 'decision' && decisionView}
          {view === 'chat' && chatView}
        </div>

        {cmpBar}
        {/* Selecting for Scout REPLACES the nav rather than floating above it.
            The five destinations all leave Browse, and leaving mid-selection
            silently discards the picks — so while you're choosing, the only
            things in the thumb zone are the count, Clear, and Generate. */}
        <div className={cn('mb-nav', expSelecting && 'is-hidden')} aria-hidden={expSelecting}>
          {navItem('home', Home, 'Homes')}
          {navItem('shortlist', Star, 'Shortlist', shortlist.length)}
          <div className="nav-add" onClick={openAdd}><div className="fab"><Icon icon={Plus} className="ico" /></div><div className="lab">Add</div></div>
          {/* "To do" is a primary destination now — it lives here rather than as
              a squeezed icon in the top bar. Decision keeps its slot; Chat + the
              rest moved to the More sheet so this row stays at five. */}
          {navItem('todo', Compass, 'To do')}
          {navItem('decision', BadgeCheck, 'Decision')}
        </div>
      </div>

      {sheet === 'add' && (
        <>
          <div className="scrim show" onClick={() => setSheet(null)} />
          <div className="sheet show"><div className="grab" />
            <div className="sh-head"><h3>Add a listing</h3><button className="iconbtn x" onClick={() => setSheet(null)} aria-label="Close"><Icon icon={X} className="ico" /></button></div>
            <div className="field-wrap"><label className="field-label">Listing URL</label><input className="field" value={addUrl} onChange={(e) => setAddUrl(e.target.value)} placeholder="Paste Airbnb / VRBO / Booking URL…" autoComplete="off" /></div>
            <div className="field-wrap" style={{ marginTop: 12 }}><label className="field-label">Nightly all-in (optional)</label><input className="field" value={addPrice} onChange={(e) => setAddPrice(e.target.value)} placeholder="$5,540" inputMode="decimal" /></div>
            <div className="so-hint"><Icon icon={Info} className="ico" /> Adds to <b>your group's submissions</b>. It rises into the shortlist once it reaches net +1 likes.</div>
            <div className="sh-foot"><button className="btn btn-ghost" onClick={() => setSheet(null)}>Cancel</button><button className="btn btn-primary" onClick={() => void addHome()} disabled={adding}><Icon icon={Plus} className="ico" /> {adding ? 'Adding…' : 'Add to board'}</button></div>
          </div>
        </>
      )}

      {/* More — everything secondary, one tap from anywhere. Keeps the top bar to
          the trip name and the bottom nav to five real destinations. */}
      {sheet === 'more' && (
        <>
          <div className="scrim show" onClick={() => setSheet(null)} />
          <div className="sheet show"><div className="grab" />
            <div className="sh-head"><h3>More</h3><button className="iconbtn x" onClick={() => setSheet(null)} aria-label="Close"><Icon icon={X} className="ico" /></button></div>
            <div className="sh-sec">
              <div className="chip-list" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={() => { setView('chat'); setSheet(null); }}>
                  <Icon icon={MessageSquare} className="ico" /> Chat{caveats.length > 0 && <span className="pip tnum" style={{ marginLeft: 'auto' }}>{caveats.length}</span>}
                </button>
                <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={() => { setView('saved'); setSheet(null); }}>
                  <Icon icon={Bookmark} className="ico" /> Saved{favoriteIds.size > 0 && <span className="pip tnum" style={{ marginLeft: 'auto' }}>{favoriteIds.size}</span>}
                </button>
                <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={toggleTheme}>
                  <Icon icon={theme === 'dark' ? Sun : Moon} className="ico" /> {theme === 'dark' ? 'Light theme' : 'Dark theme'}
                </button>
                {isOwner && (
                  <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} disabled={refreshing} onClick={() => { void refreshHomes(); setSheet(null); }}>
                    <Icon icon={RotateCw} className="ico" /> {refreshing ? 'Refreshing…' : 'Refresh listings'}
                  </button>
                )}
                {isOwner && (
                  <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={() => { setSheet(null); trip && navigate(`/t/${trip.id}/manage`); }}>
                    <Icon icon={Settings} className="ico" /> Manage trip
                  </button>
                )}
                <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={() => { setSheet(null); startOnboarding(true); }}>
                  <Icon icon={HelpCircle} className="ico" /> Show me around
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {sheet === 'filter' && (
        <>
          <div className="scrim show" onClick={() => setSheet(null)} />
          <div className="sheet show"><div className="grab" />
            <div className="sh-head"><h3>Filters &amp; split</h3><button className="iconbtn x" onClick={() => setSheet(null)} aria-label="Close"><Icon icon={X} className="ico" /></button></div>
            <div className="sh-sec"><div className="lbl">Show only</div><div className="chip-list">
              {([['under', 'Under budget'], ['pool', 'Pool required'], ['parking', 'Parking required'], ['hottub', 'Hot tub'], ['manual', 'Include “check manually”']] as const).map(([k, t]) => (
                <label key={k} className={cn('chip-filter', (k === 'manual' ? filters.manual : filters[k]) && 'on')} onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))}><span className="box"><Icon icon={Check} className="ico" /></span> {t}</label>
              ))}
            </div></div>
            <div className="sh-sec"><div className="lbl">Sleeps at least</div><div className="split-row"><input type="range" min={0} max={20} value={filters.sleeps} onChange={(e) => setFilters((f) => ({ ...f, sleeps: Number(e.target.value) }))} /><span className="val tnum">{filters.sleeps || 'any'}</span></div></div>
            <div className="sh-foot"><button className="btn btn-ghost" onClick={() => { setFilters(DEFAULT_FILTERS); }}>Reset</button><button className="btn btn-primary" onClick={() => setSheet(null)}>Show {Math.min(10, visible.length)} homes</button></div>
          </div>
        </>
      )}
    </div>
    <ComparisonModal compare={compare} />
    </>
  );
}

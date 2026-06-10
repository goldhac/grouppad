import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Crown, Settings, Bookmark, Moon, Sun, Star,
  SlidersHorizontal, Check, Home,
  BadgeCheck, MessageSquare, Plus, Sparkles, Swords, Users,
  HelpCircle, Minus, TrendingUp, Send, Lock, X, Info, Scale, UserPlus, RotateCw, Pencil,
} from 'lucide-react';
import { useApp, isDeadListing } from '@/store/AppContext';
import { api } from '@/lib/api';
import { ScoutVerdict } from '@/components/board/ScoutVerdict';
import { useCompare } from '@/hooks/useCompare';
import { ComparisonModal } from '@/components/modals/ComparisonModal';
import { ItineraryCard } from '@/components/board/ItineraryCard';
import { MobilePhotoCarousel } from '@/components/MobilePhotoCarousel';
import { type Filters, readFilters, writeFilters, DEFAULT_FILTERS } from '@/components/board/FilterBar';
import { useMobileShellLock } from '@/lib/useIsMobile';
import { Icon } from '@/components/ui/Icon';
import { fmt, netVotes } from '@/lib/utils';
import { cn } from '@/lib/cn';
import type { Listing } from '@/types';

type View = 'home' | 'shortlist' | 'decision' | 'chat' | 'saved';

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
    trip, submitted, pipeline, votes, final, caveats, isOwner, split,
    favoriteIds, shortlistIds, itinerary, aiRankIndex, aiWhy, aiRankLoading, recommendedPool, suppressedIds, pooledListings,
    user, openAuth, joinTrip, findListing, insights,
    toggleFavorite, toggleFinalPick, setDecision, openDetail, requireSignIn, postCaveat,
    approveCaveat, deleteCaveat, saveItinerary,
    submitListing, toast, selected, toggleSelect, clearSelection, setSplit, startOnboarding,
  } = useApp();
  const compare = useCompare();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useMobileShellLock();
  const [view, setView] = useState<View>('home');
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
  const [sheet, setSheet] = useState<'add' | 'filter' | null>(null);
  const [addUrl, setAddUrl] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const [adding, setAdding] = useState(false);
  const [seeAllRec, setSeeAllRec] = useState(false);
  const [itinEditOpen, setItinEditOpen] = useState(false);
  const [itinDraft, setItinDraft] = useState('');
  const [refreshing, setRefreshing] = useState(false);
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
    const rt = opts.by ? null : (l.rating
      ? <span className="rt"><Icon icon={Star} className="ico" /> {l.rating}</span>
      : <span className="rt none"><Icon icon={Star} className="ico" /> New</span>);
    return (
      <article key={l.id} className={cn('mcard', opts.compact && 'compact')} onClick={() => openDetail(l.id)} role="button" tabIndex={0}>
        <div className="ph">
          <MobilePhotoCarousel photos={l.photos} alt={l.name}>
            {isOff
              ? <span className="ribbon"><Icon icon={BadgeCheck} className="ico" /> Official pick</span>
              : <div className="tagL"><span className={`pchip ${b}`}><Icon icon={b === 'under' ? Check : b === 'over' ? TrendingUp : b === 'unknown' ? HelpCircle : Minus} className="ico" /> {B_SHORT[b]}</span></div>}
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
          {!opts.compact && aiWhy[l.id] && (
            <div className="ai-why"><Icon icon={Sparkles} className="ico" /><span>{aiWhy[l.id]}</span></div>
          )}
        </div>
      </article>
    );
  }

  // Always-visible split control — every card shows a /person price, so the
  // group size shouldn't be buried in the filter sheet.
  const splitBar = (
    <div className="splitbar">
      <span className="sb-lab"><Icon icon={Users} className="ico" /> Splitting between</span>
      <div className="sb-step">
        <button aria-label="Fewer people" onClick={() => setSplit(Math.max(2, split - 1))} disabled={split <= 2}><Icon icon={Minus} className="ico" /></button>
        <span className="sb-n tnum">{split}</span>
        <button aria-label="More people" onClick={() => setSplit(Math.min(30, split + 1))} disabled={split >= 30}><Icon icon={Plus} className="ico" /></button>
      </div>
      <span className="sb-hint">sets every /person price</span>
    </div>
  );

  // ---- views ----
  const homeView = (
    <>
      {pulse}
      {splitBar}
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
          <div className="lb-h"><span className="t">Group decision</span><span className="s">one ⭐ each · private</span></div>
          <div className="lb-prog"><span><Icon icon={Users} className="ico" /> Top-choice votes in</span><b className="tnum">{votedCount} of {groupTotal}</b></div>
          <div className="ptrack"><div className="pfill" style={{ width: `${pct}%` }} /></div>
          <div style={{ marginTop: 6 }}>
            {(shortlist.length ? shortlist : pooledListings).slice().sort((a, b) => (final.counts?.[b.id] || 0) - (final.counts?.[a.id] || 0)).slice(0, 4).map((l, i) => {
              const tv = final.counts?.[l.id] || 0; const max = Math.max(5, ...shortlist.map((x) => final.counts?.[x.id] || 0));
              return (
                <div key={l.id} className={cn('lb-bar', i === 0 && 'lead')}>
                  <span className="rk tnum">{i + 1}</span>
                  <div><div className="nm">{i === 0 && <Icon icon={Star} className="ico" />}{shortName(l.name)}</div><div className="tk"><div className="f" style={{ width: `${Math.max(7, (tv / max) * 100)}%` }} /></div></div>
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
          {isOwner && <span className="role-pill"><Icon icon={Crown} className="ico" /> Host</span>}
          {isOwner && <button className="iconbtn" disabled={refreshing} onClick={() => void refreshHomes()} aria-label="Refresh listings" title="Refresh the live listings"><Icon icon={RotateCw} className="ico" style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} /></button>}
          {isOwner && <button className="iconbtn" onClick={() => trip && navigate(`/t/${trip.id}/manage`)} aria-label="Manage"><Icon icon={Settings} className="ico" /></button>}
          <button className={cn('iconbtn', view === 'saved' && 'on')} onClick={() => setView('saved')} aria-label="Saved"><Icon icon={Bookmark} className="ico" />{favoriteIds.size > 0 && <span className="hbadge tnum">{favoriteIds.size}</span>}</button>
          <button className="iconbtn" onClick={toggleTheme} aria-label="Theme"><Icon icon={theme === 'dark' ? Sun : Moon} className="ico" /></button>
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
            {/* Only the ACTIVE filters show as chips (tap to remove) — keeps the row
                clean instead of an overflowing list of every option. */}
            {filters.under && fchip('under', 'Under budget')}
            {filters.pool && fchip('pool', 'Pool')}
            {filters.parking && fchip('parking', 'Parking')}
            {filters.hottub && fchip('hottub', 'Hot tub')}
            {filters.sleeps > 0 && <button className="fchip on" onClick={() => setFilters((f) => ({ ...f, sleeps: 0 }))}><Icon icon={Check} className="ico" /> Sleeps {filters.sleeps}+</button>}
          </div>
        )}

        <div className="mb-scroll">
          {view === 'home' && homeView}
          {view === 'shortlist' && shortlistView}
          {view === 'saved' && savedView}
          {view === 'decision' && decisionView}
          {view === 'chat' && chatView}
        </div>

        {cmpBar}
        <div className="mb-nav">
          {navItem('home', Home, 'Homes')}
          {navItem('shortlist', Star, 'Shortlist', shortlist.length)}
          <div className="nav-add" onClick={openAdd}><div className="fab"><Icon icon={Plus} className="ico" /></div><div className="lab">Add</div></div>
          {navItem('decision', BadgeCheck, 'Decision')}
          {navItem('chat', MessageSquare, 'Chat', caveats.length)}
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

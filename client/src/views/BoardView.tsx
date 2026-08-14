import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserPlus, LayoutGrid, Rows3, Heart, Trophy, MessagesSquare, Plus, SlidersHorizontal, Sparkles, Check, X, RotateCw, Bookmark, ChevronRight, ChevronDown, HelpCircle, Compass } from 'lucide-react';
import { GuidedTour, type TourStep } from '@/components/ui/GuidedTour';
import { api } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { useCompare } from '@/hooks/useCompare';
import { useIsMobile } from '@/lib/useIsMobile';
import { MobileBoard } from '@/views/MobileBoard';
import { Card } from '@/components/Card';
import { BoardTable } from '@/components/board/BoardTable';
import { EmptyBoardArt } from '@/components/ui/EmptyBoardArt';
import { Icon } from '@/components/ui/Icon';
import { BoardHeader } from '@/components/chrome/BoardHeader';
import { DecisionStrip } from '@/components/board/DecisionStrip';
import { type Filters, readFilters, writeFilters } from '@/components/board/FilterBar';
import { SplitPill } from '@/components/board/SplitPill';
import { SearchPanel } from '@/components/board/SearchPanel';
import { ItinerarySection } from '@/components/board/ItinerarySection';
import { DecisionSection } from '@/components/board/DecisionSection';
import { ShortlistSection } from '@/components/board/ShortlistSection';
import { SavedSection } from '@/components/board/SavedSection';
import { SubmittedSection } from '@/components/board/SubmittedSection';
import { ExperiencesSection } from '@/components/board/ExperiencesSection';
import { CaveatsSection } from '@/components/board/CaveatsSection';
import { PipelineSection } from '@/components/board/PipelineSection';
import { BeyondBudgetSection } from '@/components/board/BeyondBudgetSection';
import { CompareDock } from '@/components/board/CompareDock';
import { ComparisonModal } from '@/components/modals/ComparisonModal';
import { Button } from '@/components/ui/Button';

type Tab = 'all' | 'shortlist' | 'saved' | 'todo' | 'decision' | 'discussion';

const BOARD_TOUR: TourStep[] = [
  { target: '.b-controls .tabbar', title: 'Your group’s board', body: 'Everything for this trip lives in these tabs: browse, vote, compare, and decide.' },
  { target: '.b-grid article.card .ai-why', title: 'Scout ranks every home', body: 'Homes are sorted best-to-worst for your itinerary, budget, and must-haves. This line is Scout’s reason each one ranks where it does.' },
  { target: '.b-grid article.card .card-money', title: 'The number that ends the debate', body: 'Every home shows the all-in total and exactly what each person pays for five nights, taxes and cleaning folded in.' },
  { target: '.b-toolbar .split-pill', title: 'Set your group size', body: 'Tap minus or plus to change how many people are splitting the cost. Every per-person price on the board updates instantly, and it remembers your number next time.' },
  { target: '.b-grid article.card .votebar', title: 'Vote in the open', body: 'Thumbs-up the ones you like. At net +1, a home rises into the group’s Shortlist.' },
  { target: '.b-grid article.card .cbx', title: 'Compare with Scout', body: 'Tick two or more homes, then Compare for a side-by-side with Scout’s verdict. Open a home for an AI video walkthrough, map, and reviews.' },
  { target: '.row-tint.community', title: 'Community submissions', body: 'Homes anyone pastes in land here. The same villa from two different sites is merged automatically.' },
  { target: '.b-grid article.card .save-btn', title: 'Save your own picks', body: 'Bookmark homes to your private Saved list that only you see. Ask Scout to rank just yours.' },
  { target: '.b-toolbar .filters-btn', title: 'Filter to what fits', body: 'Narrow by budget, pool, parking, hot tub, or a minimum sleeps. Filters stick across refreshes.' },
  { target: '[data-tab="shortlist"]', title: 'Let Scout decide', body: 'In Shortlist, ask Scout to rank the finalists against your group’s criteria. There’s also a box to ask Scout your own question, answered just for you and never shared with the group.' },
  { target: '[data-tab="discussion"]', title: 'Tell Scout what matters', body: 'Request a must-have in Discussion. The organizer approves it, then Scout weighs it.' },
  { target: '[data-tab="decision"]', title: 'Lock the official pick', body: 'Everyone casts one top choice; the organizer seals the winner with the gold lock.' },
  { target: '[data-tour="account"]', title: 'Make it yours — themes & avatar', body: 'Open your account menu to switch the board’s color theme (Tropical, Forest, Sunset…) or change your avatar. Organizers set the trip’s default theme; you can override it just for yourself.' },
];

/** Paste-a-URL add toolbar — collapsed to a button until you start adding,
 *  to keep the masthead light. */
function AddToolbar({ onOpenFilters, filterCount, shown, total, onTour }: { onOpenFilters: () => void; filterCount: number; shown: number; total: number; onTour: () => void }) {
  const { submitListing, requireSignIn, toast, isOwner, tripId } = useApp();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [openField, setOpenField] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    if (!tripId || refreshing) return;
    setRefreshing(true);
    try {
      await api.refreshListings(tripId);
      toast('Refreshing listings. Fresh homes appear in about a minute.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not refresh right now.', 'error');
    } finally {
      setRefreshing(false);
    }
  }

  async function add() {
    if (!url.trim()) return;
    if (!requireSignIn('add a home')) return;
    setBusy(true);
    try {
      await submitListing(url.trim());
      setUrl('');
      setOpenField(false);
      toast('Added. It rises into the Shortlist at net +1.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not add that link.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="b-toolbar">
      {openField ? (
        <div className="add">
          <input
            className="field"
            autoFocus
            placeholder="Paste an Airbnb, VRBO, or Booking link…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => !url.trim() && setOpenField(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') void add(); if (e.key === 'Escape') setOpenField(false); }}
          />
          <button className="btn btn-primary" onClick={add} disabled={busy}>
            <Icon icon={Plus} className="ico" /> {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      ) : (
        <button className="btn btn-ghost btn-sm" onClick={() => setOpenField(true)}>
          <Icon icon={Plus} className="ico" /> Add a home
        </button>
      )}
      {isOwner && (
        <button className="btn btn-ghost btn-sm" onClick={() => void refresh()} disabled={refreshing} title="Refresh listings, once per cycle; they also auto-refresh every few days">
          <Icon icon={RotateCw} className="ico" /> {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      )}
      <button className="btn btn-ghost btn-sm filters-btn" onClick={onOpenFilters}>
        <Icon icon={SlidersHorizontal} className="ico" /> Filters
        {filterCount > 0 && <span className="fcount tnum">{filterCount}</span>}
      </button>
      <SplitPill />
      <button className="btn btn-ghost btn-sm btn-icon" onClick={onTour} title="Show me around" aria-label="Show me around">
        <Icon icon={HelpCircle} className="ico" />
      </button>
      <span className="b-count tnum">{shown} of {total}</span>
    </div>
  );
}

export function BoardView() {
  const {
    listings, caveats, shortlistIds, favoriteIds, split, setSplit, selected, trip, user,
    requireSignIn, joinTrip, detailId, openDetail, closeDetail, findListing, isOwner,
    aiRankIndex, aiRankLoading, recommendedPool, siteTourSignal, experiences,
  } = useApp();
  const compare = useCompare();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [topAll, setTopAll] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [sheet, setSheet] = useState<null | 'filters'>(null);

  // External trigger (e.g. the invite welcome's "browse the homes first") asks
  // for the guided walkthrough. Skip the initial 0; jump to Recommended first.
  useEffect(() => {
    if (siteTourSignal > 0) { setTab('all'); setTourOpen(true); }
  }, [siteTourSignal]);

  // ── Deep-link a tab (?tab=todo) ──────────────────────────────────────────
  // So an email or a shared link can drop someone straight onto the things to
  // do, rather than the homes grid with a "now find the right tab" puzzle.
  const tabParam = searchParams.get('tab');
  useEffect(() => {
    const valid: Tab[] = ['all', 'shortlist', 'saved', 'todo', 'decision', 'discussion'];
    if (tabParam && (valid as string[]).includes(tabParam)) setTab(tabParam as Tab);
    // Only on arrival — after that the tab bar owns the state, and re-running
    // this would fight every click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  // ── Deep-link the detail modal (?listing=<id> ⇄ DetailModal) ──────────────
  const linkParam = searchParams.get('listing');
  const prevDetail = useRef<string | null>(null);
  useEffect(() => {
    if (linkParam && linkParam !== detailId && findListing(linkParam)) openDetail(linkParam);
    else if (!linkParam && detailId) closeDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkParam, findListing]);
  useEffect(() => {
    const cur = searchParams.get('listing');
    if (detailId) {
      if (detailId !== cur) {
        const next = new URLSearchParams(searchParams);
        next.set('listing', detailId);
        setSearchParams(next);
      }
    } else if (prevDetail.current && cur) {
      const next = new URLSearchParams(searchParams);
      next.delete('listing');
      setSearchParams(next, { replace: true });
    }
    prevDetail.current = detailId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailId]);

  // Filters persist per-trip — they stay locked in across refreshes/reloads
  // until the user changes them.
  const [filters, setFilters] = useState<Filters>(() => readFilters(trip?.id));
  const filtersTripRef = useRef(trip?.id);
  useEffect(() => {
    if (filtersTripRef.current !== trip?.id) { filtersTripRef.current = trip?.id; setFilters(readFilters(trip?.id)); }
  }, [trip?.id]);
  useEffect(() => { writeFilters(trip?.id, filters); }, [filters, trip?.id]);
  // count of *active* filters (manual defaults on, so a bare board reads 0)
  const activeFilterCount = (filters.under ? 1 : 0) + (filters.pool ? 1 : 0) + (filters.parking ? 1 : 0) + (filters.hottub ? 1 : 0) + (filters.sleeps ? 1 : 0) + (filters.manual ? 0 : 1);

  // Recommended draws from the cross-pool, budget-safe, AI-ranked set (already
  // ordered + deduped in the store) — curated + live + community together.
  const mainGrid = useMemo(
    () =>
      recommendedPool.filter((l) => {
        if (shortlistIds.has(l.id)) return false;
        if (filters.under && !(l.budget === 'under' || l.budget === 'marginal')) return false;
        if (filters.pool && l.pool !== 'yes') return false;
        if (filters.parking && l.parking !== 'yes') return false;
        if (filters.hottub && l.hot_tub !== 'yes') return false;
        if (filters.sleeps && (l.sleeps ?? 0) < filters.sleeps) return false;
        if (!filters.manual && l.check_manual) return false;
        return true;
      }),
    [recommendedPool, shortlistIds, filters],
  );
  const topHomes = topAll ? mainGrid : mainGrid.slice(0, 10);

  const perPersonAvg = useMemo(() => {
    const first = recommendedPool.find((l) => l.est_5n);
    return first?.est_5n ? Math.ceil(first.est_5n / split) : null;
  }, [recommendedPool, split]);

  const showJoin = trip && !trip.isMember && !trip.isOwner;

  const TABS: { key: Tab; label: string; icon: typeof LayoutGrid; pip?: number }[] = [
    { key: 'all', label: 'Recommended', icon: LayoutGrid, pip: recommendedPool.length },
    { key: 'shortlist', label: 'Shortlist', icon: Heart, pip: shortlistIds.size },
    { key: 'saved', label: 'Saved', icon: Bookmark, pip: favoriteIds.size },
    { key: 'todo', label: 'To do', icon: Compass, pip: experiences.length },
    { key: 'decision', label: 'Decision', icon: Trophy },
    { key: 'discussion', label: 'Discussion', icon: MessagesSquare, pip: caveats.length },
  ];

  // Mobile (≤520px): dedicated app-shell from the design handoff. Desktop untouched.
  if (isMobile) return <MobileBoard />;

  return (
    <div className="board">
      {/* ── Sticky masthead ───────────────────────────────────────────────── */}
      <div className="b-stick" style={{ top: 56 }}>
        <BoardHeader />

        {showJoin && (
          <div className="join-banner">
            <Icon icon={UserPlus} className="ico" />
            <span>You’re viewing as a guest. <b>Sign in to join</b> to vote, add homes, and comment.</span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => { if (requireSignIn('join this trip') && trip) void joinTrip(trip.id); }}
            >
              {user ? 'Join this trip' : 'Sign in to join'}
            </Button>
          </div>
        )}

        <DecisionStrip onLeaderboard={() => setTab('decision')} onCompare={() => setTab('shortlist')} />

        {/* Tabs + add/filter controls share one row */}
        <div className="b-controls">
          <div className="tabbar" role="tablist">
            {TABS.map((t) => (
              <div
                key={t.key}
                role="tab"
                data-tab={t.key}
                aria-selected={tab === t.key}
                tabIndex={0}
                className={`tab${tab === t.key ? ' on' : ''}`}
                onClick={() => setTab(t.key)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setTab(t.key)}
              >
                <Icon icon={t.icon} className="ico" /> {t.label}
                {t.pip != null && <span className="pip tnum">{t.pip}</span>}
              </div>
            ))}
          </div>
          {tab !== 'todo' && tab !== 'discussion' && (
            <AddToolbar onOpenFilters={() => setSheet('filters')} filterCount={activeFilterCount} shown={mainGrid.length} total={recommendedPool.length} onTour={() => { setTab('all'); setTourOpen(true); }} />
          )}
        </div>

        {/* Mobile-only quick filter scroller (container-query gated to ≤860px) */}
        <div className="m-filterscroll" style={tab === 'todo' || tab === 'discussion' ? { display: 'none' } : undefined}>
          {MFILTERS.map((c) => (
            <label key={c.key} className={`chip-filter${filters[c.key] ? ' on' : ''}`}>
              <input type="checkbox" checked={filters[c.key]} onChange={() => setFilters({ ...filters, [c.key]: !filters[c.key] })} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
              <span className="box"><Icon icon={Check} className="ico" /></span>{c.short}
            </label>
          ))}
          <button className="btn btn-ghost btn-sm m-filterbtn" onClick={() => setSheet('filters')}>
            <Icon icon={SlidersHorizontal} className="ico" /> Split · {split}
          </button>
        </div>
      </div>

      {/* ── Active tab panel ──────────────────────────────────────────────── */}
      <div className="tab-panel gp-panel" key={tab}>
        {tab === 'all' && (
          <>
            {isOwner && <SearchPanel />}
            <section>
              <div className="row-head">
                <span className="ttl">Top recommended</span>
                <span className="cnt tnum">{topHomes.length}</span>
                <span className="sub">{aiRankLoading ? 'Scout is ranking these for your group…' : aiRankIndex.size ? 'ranked by Scout for your itinerary · filtered' : 'ranked for your group · filtered'}</span>
                <div className="rh-right">
                  {mainGrid.length > 10 && (
                    <button className="seeall" onClick={() => setTopAll((v) => !v)}>
                      {topAll ? <>Show top 10 <Icon icon={ChevronDown} className="ico" /></> : <>See all {mainGrid.length} <Icon icon={ChevronRight} className="ico" /></>}
                    </button>
                  )}
                  {mainGrid.length > 0 && (
                    <div className="view-toggle" role="group" aria-label="View">
                      <button className={`vt${view === 'grid' ? ' on' : ''}`} onClick={() => setView('grid')} aria-pressed={view === 'grid'} aria-label="Grid view" title="Grid"><Icon icon={LayoutGrid} className="ico" /></button>
                      <button className={`vt${view === 'list' ? ' on' : ''}`} onClick={() => setView('list')} aria-pressed={view === 'list'} aria-label="List view" title="List"><Icon icon={Rows3} className="ico" /></button>
                    </div>
                  )}
                </div>
              </div>
              {mainGrid.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  {listings.length === 0 && <EmptyBoardArt />}
                  <p className="text-text-muted">
                    {listings.length === 0
                      ? 'No homes yet. Paste a rental link above to add the homes your group is considering.'
                      : 'No homes match these filters.'}
                  </p>
                </div>
              ) : view === 'list' ? (
                <BoardTable homes={topHomes} />
              ) : (
                <div className="b-grid">
                  {topHomes.map((l) => <Card key={l.id} listing={l} />)}
                </div>
              )}
            </section>
            <SubmittedSection view={view} />
            <PipelineSection filters={filters} view={view} />
            <BeyondBudgetSection view={view} />
          </>
        )}

        {tab === 'shortlist' && <ShortlistSection compare={compare} />}

        {tab === 'saved' && <SavedSection />}

        {tab === 'todo' && <ExperiencesSection />}

        {tab === 'decision' && <DecisionSection />}

        {tab === 'discussion' && (
          <div className="discussion-grid">
            <CaveatsSection />
            <ItinerarySection />
          </div>
        )}
      </div>

      {/* ── Mobile bottom action bar (container-query gated to ≤860px) ─────── */}
      <div className="m-bottombar">
        <button className="btn btn-ghost btn-sm" onClick={() => { setTab('all'); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.b-toolbar .add input')?.focus()); }}>
          <Icon icon={Plus} className="ico" /> Add
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setSheet('filters')}>
          <Icon icon={SlidersHorizontal} className="ico" /> Filters
        </button>
        {selected.size >= 2 ? (
          <button className="btn btn-primary btn-sm" onClick={() => void compare.runSelected('multi')}>
            <Icon icon={Sparkles} className="ico" /> Compare {selected.size}
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => setTab('decision')}>
            <Icon icon={Trophy} className="ico" /> Decision
          </button>
        )}
      </div>

      {/* ── Mobile filter sheet ───────────────────────────────────────────── */}
      {sheet === 'filters' && (
        <>
          <div className="sheet-scrim" onClick={() => setSheet(null)} />
          <div className="sheet" role="dialog" aria-label="Filters">
            <div className="grab" />
            <div className="sheet-head">
              <h3>Filters</h3>
              <button className="btn btn-ghost btn-sm x" onClick={() => setSheet(null)} aria-label="Close"><Icon icon={X} className="ico" /></button>
            </div>
            <div className="sheet-sec">
              <div className="filt-list">
                {MFILTERS.map((c) => (
                  <label key={c.key} className={`chip-filter${filters[c.key] ? ' on' : ''}`}>
                    <input type="checkbox" checked={filters[c.key]} onChange={() => setFilters({ ...filters, [c.key]: !filters[c.key] })} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                    <span className="box"><Icon icon={Check} className="ico" /></span>{c.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="sheet-sec">
              <div className="split">
                <span className="lab">Split</span>
                <input type="range" min={2} max={30} step={1} value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Split between this many people" />
                <span className="val tnum">{split} people{perPersonAvg != null ? ` · $${perPersonAvg}/ea` : ''}</span>
              </div>
            </div>
            <div className="filt-foot">
              <span>Showing <span className="tnum">{mainGrid.length}</span> of <span className="tnum">{recommendedPool.length}</span></span>
              <button className="btn btn-primary btn-sm" onClick={() => setSheet(null)}>Done</button>
            </div>
          </div>
        </>
      )}

      <CompareDock compare={compare} />
      <ComparisonModal compare={compare} />
      <GuidedTour steps={BOARD_TOUR} open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}

const MFILTERS: { key: 'under' | 'pool' | 'parking' | 'hottub' | 'manual'; label: string; short: string }[] = [
  { key: 'under', label: 'Under budget only', short: 'Under budget' },
  { key: 'pool', label: 'Pool required', short: 'Pool' },
  { key: 'parking', label: 'Parking required', short: 'Parking' },
  { key: 'hottub', label: 'Hot tub', short: 'Hot tub' },
  { key: 'manual', label: 'Include “check manually”', short: 'Manual' },
];

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserPlus, LayoutGrid, Rows3, Heart, Trophy, MessagesSquare, Plus, SlidersHorizontal, Sparkles, Check, X, RotateCw, Bookmark, ChevronRight, ChevronDown, HelpCircle } from 'lucide-react';
import { GuidedTour, type TourStep } from '@/components/ui/GuidedTour';
import { api } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { useCompare } from '@/hooks/useCompare';
import { Card } from '@/components/Card';
import { BoardTable } from '@/components/board/BoardTable';
import { EmptyBoardArt } from '@/components/ui/EmptyBoardArt';
import { Icon } from '@/components/ui/Icon';
import { BoardHeader } from '@/components/chrome/BoardHeader';
import { DecisionStrip } from '@/components/board/DecisionStrip';
import { type Filters } from '@/components/board/FilterBar';
import { SearchPanel } from '@/components/board/SearchPanel';
import { ItinerarySection } from '@/components/board/ItinerarySection';
import { DecisionSection } from '@/components/board/DecisionSection';
import { ShortlistSection } from '@/components/board/ShortlistSection';
import { SavedSection } from '@/components/board/SavedSection';
import { SubmittedSection } from '@/components/board/SubmittedSection';
import { CaveatsSection } from '@/components/board/CaveatsSection';
import { PipelineSection } from '@/components/board/PipelineSection';
import { CompareDock } from '@/components/board/CompareDock';
import { ComparisonModal } from '@/components/modals/ComparisonModal';
import { Button } from '@/components/ui/Button';

type Tab = 'all' | 'shortlist' | 'saved' | 'decision' | 'discussion';

const BOARD_TOUR: TourStep[] = [
  { target: '.b-controls .tabbar', title: 'Your group’s board', body: 'Everything for this trip — browse, vote, compare, and decide — lives in these tabs.' },
  { target: '.b-grid article.card .card-money', title: 'The number that ends the debate', body: 'Every home shows the all-in cost and exactly what each person pays.' },
  { target: '.b-grid article.card .votebar', title: 'Vote in the open', body: 'Thumbs-up the ones you like. At net +1, a home rises into the group’s Shortlist.' },
  { target: '.b-grid article.card .save-btn', title: 'Save your own picks', body: 'Bookmark homes to your private Saved list — only you see it. Ask Scout to rank just yours.' },
  { target: '.b-toolbar .filters-btn', title: 'Filter to what fits', body: 'Narrow by budget, pool, or parking. Owners can also refresh the live listings.' },
  { target: '[data-tab="shortlist"]', title: 'Let Scout decide', body: 'In Shortlist, ask Scout to rank the finalists against your group’s approved criteria.' },
  { target: '[data-tab="discussion"]', title: 'Tell Scout what matters', body: 'Request a must-have in Discussion — the organizer approves it, then Scout weighs it.' },
  { target: '[data-tab="decision"]', title: 'Lock the official pick', body: 'Everyone casts one top choice; the organizer seals the winner with the gold lock.' },
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
      toast('Refreshing listings — fresh homes appear in about a minute.', 'success');
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
      toast('Added — it rises into the Shortlist at net +1.', 'success');
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
        <button className="btn btn-ghost btn-sm" onClick={() => void refresh()} disabled={refreshing} title="Refresh listings — once per cycle; they also auto-refresh every few days">
          <Icon icon={RotateCw} className="ico" /> {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      )}
      <button className="btn btn-ghost btn-sm filters-btn" onClick={onOpenFilters}>
        <Icon icon={SlidersHorizontal} className="ico" /> Filters
        {filterCount > 0 && <span className="fcount tnum">{filterCount}</span>}
      </button>
      <button className="btn btn-ghost btn-sm btn-icon" onClick={onTour} title="Show me around" aria-label="Show me around">
        <Icon icon={HelpCircle} className="ico" />
      </button>
      <span className="b-count tnum">{shown} of {total}</span>
    </div>
  );
}

const DEFAULT_FILTERS: Filters = { under: false, pool: false, parking: false, manual: true };
const FILTERS_KEY = (id?: string) => `gp_filters_${id || 'default'}`;
function readFilters(id?: string): Filters {
  if (!id) return DEFAULT_FILTERS;
  try { const raw = localStorage.getItem(FILTERS_KEY(id)); return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS; }
  catch { return DEFAULT_FILTERS; }
}

export function BoardView() {
  const {
    listings, caveats, shortlistIds, favoriteIds, split, setSplit, selected, trip, user,
    requireSignIn, joinTrip, detailId, openDetail, closeDetail, findListing, isOwner,
  } = useApp();
  const compare = useCompare();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [topAll, setTopAll] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [sheet, setSheet] = useState<null | 'filters'>(null);

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
  useEffect(() => {
    if (trip?.id) { try { localStorage.setItem(FILTERS_KEY(trip.id), JSON.stringify(filters)); } catch { /* ignore */ } }
  }, [filters, trip?.id]);
  // count of *active* filters (manual defaults on, so a bare board reads 0)
  const activeFilterCount = (filters.under ? 1 : 0) + (filters.pool ? 1 : 0) + (filters.parking ? 1 : 0) + (filters.manual ? 0 : 1);

  const mainGrid = useMemo(
    () =>
      listings.filter((l) => {
        if (shortlistIds.has(l.id)) return false;
        if (filters.under && !(l.budget === 'under' || l.budget === 'marginal')) return false;
        if (filters.pool && l.pool !== 'yes') return false;
        if (filters.parking && l.parking !== 'yes') return false;
        if (!filters.manual && l.check_manual) return false;
        return true;
      }),
    [listings, shortlistIds, filters],
  );
  const topHomes = topAll ? mainGrid : mainGrid.slice(0, 10);

  const perPersonAvg = useMemo(() => {
    const first = listings.find((l) => (l.budget === 'under' || l.budget === 'marginal') && l.est_5n);
    return first?.est_5n ? Math.ceil(first.est_5n / split) : null;
  }, [listings, split]);

  const showJoin = trip && !trip.isMember && !trip.isOwner;

  const TABS: { key: Tab; label: string; icon: typeof LayoutGrid; pip?: number }[] = [
    { key: 'all', label: 'Recommended', icon: LayoutGrid, pip: listings.length },
    { key: 'shortlist', label: 'Shortlist', icon: Heart, pip: shortlistIds.size },
    { key: 'saved', label: 'Saved', icon: Bookmark, pip: favoriteIds.size },
    { key: 'decision', label: 'Decision', icon: Trophy },
    { key: 'discussion', label: 'Discussion', icon: MessagesSquare, pip: caveats.length },
  ];

  return (
    <div className="board">
      {/* ── Sticky masthead ───────────────────────────────────────────────── */}
      <div className="b-stick" style={{ top: 56 }}>
        <BoardHeader />

        {showJoin && (
          <div className="join-banner">
            <Icon icon={UserPlus} className="ico" />
            <span>You’re viewing as a guest. <b>Sign in to join</b> — vote, add homes, and comment.</span>
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
          <AddToolbar onOpenFilters={() => setSheet('filters')} filterCount={activeFilterCount} shown={mainGrid.length} total={listings.length} onTour={() => { setTab('all'); setTourOpen(true); }} />
        </div>

        {/* Mobile-only quick filter scroller (container-query gated to ≤860px) */}
        <div className="m-filterscroll">
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
                <span className="sub">ranked for your group · filtered</span>
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
                      ? 'No homes yet — paste a rental link above to add the homes your group is considering.'
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
          </>
        )}

        {tab === 'shortlist' && <ShortlistSection compare={compare} />}

        {tab === 'saved' && <SavedSection />}

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
              <span>Showing <span className="tnum">{mainGrid.length}</span> of <span className="tnum">{listings.length}</span></span>
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

const MFILTERS: { key: keyof Filters; label: string; short: string }[] = [
  { key: 'under', label: 'Under budget only', short: 'Under budget' },
  { key: 'pool', label: 'Pool required', short: 'Pool' },
  { key: 'parking', label: 'Parking required', short: 'Parking' },
  { key: 'manual', label: 'Include “check manually”', short: 'Manual' },
];

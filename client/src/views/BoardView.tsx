import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserPlus, LayoutGrid, Rows3, Heart, Trophy, MessagesSquare, Plus, SlidersHorizontal, Sparkles, Check, X } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { useCompare } from '@/hooks/useCompare';
import { Card } from '@/components/Card';
import { BoardStats } from '@/components/board/BoardStats';
import { BoardTable } from '@/components/board/BoardTable';
import { EmptyBoardArt } from '@/components/ui/EmptyBoardArt';
import { Icon } from '@/components/ui/Icon';
import { BoardHeader } from '@/components/chrome/BoardHeader';
import { DecisionStrip } from '@/components/board/DecisionStrip';
import { FilterBar, type Filters } from '@/components/board/FilterBar';
import { SearchPanel } from '@/components/board/SearchPanel';
import { ItinerarySection } from '@/components/board/ItinerarySection';
import { DecisionSection } from '@/components/board/DecisionSection';
import { ShortlistSection } from '@/components/board/ShortlistSection';
import { SubmittedSection } from '@/components/board/SubmittedSection';
import { CaveatsSection } from '@/components/board/CaveatsSection';
import { PipelineSection } from '@/components/board/PipelineSection';
import { CompareDock } from '@/components/board/CompareDock';
import { ComparisonModal } from '@/components/modals/ComparisonModal';
import { Button } from '@/components/ui/Button';

type Tab = 'all' | 'shortlist' | 'decision' | 'discussion';

/** Paste-a-URL add toolbar — collapsed to a button until you start adding,
 *  to keep the masthead light. */
function AddToolbar({ onFindMore }: { onFindMore: () => void }) {
  const { submitListing, requireSignIn, isOwner, toast } = useApp();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [openField, setOpenField] = useState(false);

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
      <span className="spacer" />
      {isOwner && (
        <button className="btn btn-ghost btn-sm" onClick={onFindMore}>Find more</button>
      )}
    </div>
  );
}

export function BoardView() {
  const {
    listings, caveats, shortlistIds, split, setSplit, selected, trip, user,
    requireSignIn, joinTrip, detailId, openDetail, closeDetail, findListing, isOwner,
  } = useApp();
  const compare = useCompare();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sheet, setSheet] = useState<null | 'filters'>(null);
  const searchRef = useRef<HTMLDivElement>(null);

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

  const [filters, setFilters] = useState<Filters>({ under: false, pool: false, parking: false, manual: true });

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

  const perPersonAvg = useMemo(() => {
    const first = listings.find((l) => (l.budget === 'under' || l.budget === 'marginal') && l.est_5n);
    return first?.est_5n ? Math.ceil(first.est_5n / split) : null;
  }, [listings, split]);

  const showJoin = trip && !trip.isMember && !trip.isOwner;

  const goFindMore = () => {
    setTab('all');
    requestAnimationFrame(() => searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const TABS: { key: Tab; label: string; icon: typeof LayoutGrid; pip?: number }[] = [
    { key: 'all', label: 'All homes', icon: LayoutGrid, pip: listings.length },
    { key: 'shortlist', label: 'Shortlist', icon: Heart, pip: shortlistIds.size },
    { key: 'decision', label: 'Decision', icon: Trophy },
    { key: 'discussion', label: 'Discussion', icon: MessagesSquare, pip: caveats.length },
  ];

  return (
    <div className="board">
      {/* ── Sticky masthead ───────────────────────────────────────────────── */}
      <div className="b-stick" style={{ top: 56 }}>
        <BoardHeader onFindMore={goFindMore} />

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
        <AddToolbar onFindMore={goFindMore} />
        <FilterBar filters={filters} setFilters={setFilters} shown={mainGrid.length} total={listings.length} perPersonAvg={perPersonAvg} />

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

        <div className="tabbar" role="tablist">
          {TABS.map((t) => (
            <div
              key={t.key}
              role="tab"
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
      </div>

      {/* ── Active tab panel ──────────────────────────────────────────────── */}
      <div className="tab-panel gp-panel" key={tab}>
        {tab === 'all' && (
          <>
            {listings.length > 0 && <BoardStats homes={mainGrid} />}
            {isOwner && <div ref={searchRef}><SearchPanel /></div>}
            <section>
              <div className="row-head">
                <span className="ttl">All homes</span>
                <span className="cnt tnum">{mainGrid.length}</span>
                <span className="sub">curated · filtered</span>
                {mainGrid.length > 0 && (
                  <div className="view-toggle" role="group" aria-label="View">
                    <button className={`vt${view === 'grid' ? ' on' : ''}`} onClick={() => setView('grid')} aria-pressed={view === 'grid'} aria-label="Grid view" title="Grid"><Icon icon={LayoutGrid} className="ico" /></button>
                    <button className={`vt${view === 'list' ? ' on' : ''}`} onClick={() => setView('list')} aria-pressed={view === 'list'} aria-label="List view" title="List"><Icon icon={Rows3} className="ico" /></button>
                  </div>
                )}
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
                <BoardTable homes={mainGrid} />
              ) : (
                <div className="b-grid">
                  {mainGrid.map((l) => <Card key={l.id} listing={l} />)}
                </div>
              )}
            </section>
            <SubmittedSection />
            <PipelineSection filters={filters} />
          </>
        )}

        {tab === 'shortlist' && <ShortlistSection compare={compare} />}

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
    </div>
  );
}

const MFILTERS: { key: keyof Filters; label: string; short: string }[] = [
  { key: 'under', label: 'Under budget only', short: 'Under budget' },
  { key: 'pool', label: 'Pool required', short: 'Pool' },
  { key: 'parking', label: 'Parking required', short: 'Parking' },
  { key: 'manual', label: 'Include “check manually”', short: 'Manual' },
];

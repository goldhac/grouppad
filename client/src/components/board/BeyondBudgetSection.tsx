import { useMemo, useState } from 'react';
import { Banknote, ChevronRight, ChevronDown } from 'lucide-react';
import { useApp, isDeadListing } from '@/store/AppContext';
import { Card } from '@/components/Card';
import { BoardTable } from '@/components/board/BoardTable';
import { Icon } from '@/components/ui/Icon';

const CAP = 8;

/** Homes that can't be *recommended* (over budget or no confirmed price) but
 *  must stay browsable — members may still want to vote one up or split the
 *  cost differently. Complements the Recommended grid, never overlaps it. */
export function BeyondBudgetSection({ view = 'grid' }: { view?: 'grid' | 'list' }) {
  const { pooledListings, recommendedPool, submitted, pipeline, shortlistIds, final } = useApp();
  const [open, setOpen] = useState(false);

  // Community + live sections already render their own homes (all budgets), so
  // this section only covers the leftovers they don't — i.e. curated homes.
  const items = useMemo(() => {
    const inRec = new Set(recommendedPool.map((l) => l.id));
    const shownElsewhere = new Set([...submitted, ...pipeline].map((l) => l.id));
    const decided = final.decision?.listing_id;
    return pooledListings
      .filter((l) => !inRec.has(l.id) && !shownElsewhere.has(l.id) && !shortlistIds.has(l.id) && l.id !== decided && !isDeadListing(l))
      .sort((a, b) => (a.est_5n ?? Number.MAX_SAFE_INTEGER) - (b.est_5n ?? Number.MAX_SAFE_INTEGER));
  }, [pooledListings, recommendedPool, submitted, pipeline, shortlistIds, final.decision]);

  if (items.length === 0) return null;
  const shown = open ? items : items.slice(0, CAP);

  return (
    <section className="row-tint">
      <div className="row-head">
        <Icon icon={Banknote} className="ico-lead" style={{ color: 'var(--over)' }} />
        <span className="ttl">Beyond the budget</span>
        <span className="cnt tnum">{items.length}</span>
        <span className="sub">over budget or unpriced · still worth a look</span>
        {items.length > CAP && (
          <button className="seeall" style={{ marginLeft: 'auto' }} onClick={() => setOpen((v) => !v)}>
            {open ? <>Show less <Icon icon={ChevronDown} className="ico" /></> : <>See all {items.length} <Icon icon={ChevronRight} className="ico" /></>}
          </button>
        )}
      </div>
      {view === 'list' ? (
        <BoardTable homes={shown} />
      ) : (
        <div className="b-grid">{shown.map((l) => <Card key={l.id} listing={l} />)}</div>
      )}
    </section>
  );
}

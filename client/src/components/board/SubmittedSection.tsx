import { useMemo, useState } from 'react';
import { Users, ChevronRight, ChevronDown } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Card } from '@/components/Card';
import { BoardTable } from '@/components/board/BoardTable';
import { Icon } from '@/components/ui/Icon';
import { netVotes, mansionScore } from '@/lib/utils';

const CAP = 8;

/** Community submissions — same card as the board; a "See all" cap, and it
 *  follows the grid/list view toggle. */
export function SubmittedSection({ view = 'grid' }: { view?: 'grid' | 'list' }) {
  const { submitted, shortlistIds, votes } = useApp();
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () =>
      submitted
        .filter((l) => !shortlistIds.has(l.id))
        .sort((a, b) => netVotes(votes, b.id) - netVotes(votes, a.id) || mansionScore(b) - mansionScore(a)),
    [submitted, shortlistIds, votes],
  );

  if (items.length === 0) return null;
  const shown = open ? items : items.slice(0, CAP);

  return (
    <section className="row-tint community">
      <div className="row-head">
        <Icon icon={Users} className="ico-lead" style={{ color: 'var(--community)' }} />
        <span className="ttl">Community submissions</span>
        <span className="cnt tnum">{items.length}</span>
        <span className="sub">member-added · not yet liked</span>
        {items.length > CAP && (
          <button className="seeall" style={{ marginLeft: 'auto' }} onClick={() => setOpen((v) => !v)}>
            {open ? <>Show less <Icon icon={ChevronDown} className="ico" /></> : <>See all {items.length} <Icon icon={ChevronRight} className="ico" /></>}
          </button>
        )}
      </div>
      {view === 'list' ? (
        <BoardTable homes={shown} />
      ) : (
        <div className="b-grid">{shown.map((l) => <Card key={l.id} listing={l} isSubmitted />)}</div>
      )}
    </section>
  );
}

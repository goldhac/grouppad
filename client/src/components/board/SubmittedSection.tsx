import { useMemo, useState } from 'react';
import { Users, ChevronRight, ChevronDown } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Card } from '@/components/Card';
import { Icon } from '@/components/ui/Icon';
import { netVotes, mansionScore } from '@/lib/utils';

/** Community submissions — a tinted carousel row; "See all" expands to a full grid. */
export function SubmittedSection() {
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

  return (
    <section className="row-tint community">
      <div className="row-head">
        <Icon icon={Users} className="ico-lead" style={{ color: 'var(--community)' }} />
        <span className="ttl">Community submissions</span>
        <span className="cnt tnum">{items.length}</span>
        <span className="sub">member-added · not yet liked</span>
        <span className="spacer" />
        {items.length > 3 && (
          <button className="seeall" onClick={() => setOpen((v) => !v)}>
            {open ? <>Show less <Icon icon={ChevronDown} className="ico" /></> : <>See all {items.length} <Icon icon={ChevronRight} className="ico" /></>}
          </button>
        )}
      </div>
      {open ? (
        <div className="b-grid">{items.map((l) => <Card key={l.id} listing={l} isSubmitted />)}</div>
      ) : (
        <div className="h-scroll">{items.map((l) => <Card key={l.id} listing={l} isSubmitted compact />)}</div>
      )}
    </section>
  );
}

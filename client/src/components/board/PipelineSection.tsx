import { useMemo, useState } from 'react';
import { Radio, ChevronRight, ChevronDown } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Card } from '@/components/Card';
import { Icon } from '@/components/ui/Icon';
import { mansionScore } from '@/lib/utils';
import type { Filters } from '@/components/board/FilterBar';

/** Live listings — a tinted carousel row; "See all" expands to a full grid. */
export function PipelineSection({ filters }: { filters: Filters }) {
  const { pipeline, shortlistIds } = useApp();
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    const filtered = pipeline.filter((l) => {
      if (shortlistIds.has(l.id)) return false;
      if (filters.under && !(l.budget === 'under' || l.budget === 'marginal')) return false;
      if (filters.pool && l.pool !== 'yes') return false;
      if (filters.parking && l.parking !== 'yes') return false;
      return true;
    });
    return filtered.sort((a, b) => mansionScore(b) - mansionScore(a));
  }, [pipeline, shortlistIds, filters]);

  if (pipeline.length === 0) return null;

  return (
    <section className="row-tint live">
      <div className="row-head">
        <Icon icon={Radio} className="ico-lead" style={{ color: 'var(--live)' }} />
        <span className="ttl">Live listings</span>
        <span className="cnt tnum">{items.length}</span>
        <span className="sub">auto-scraped from VRBO &amp; Airbnb · refreshed every 3 days</span>
        <span className="spacer" />
        {items.length > 3 && (
          <button className="seeall" onClick={() => setOpen((v) => !v)}>
            {open ? <>Show less <Icon icon={ChevronDown} className="ico" /></> : <>See all {items.length} <Icon icon={ChevronRight} className="ico" /></>}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="px-1 py-2 text-[13px] text-text-muted">No live listings match these filters.</p>
      ) : open ? (
        <div className="b-grid">{items.map((l) => <Card key={l.id} listing={l} isPipeline />)}</div>
      ) : (
        <div className="h-scroll">{items.map((l) => <Card key={l.id} listing={l} isPipeline compact />)}</div>
      )}
    </section>
  );
}

import { useMemo } from 'react';
import { Radio } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Card } from '@/components/Card';
import { Icon } from '@/components/ui/Icon';
import { mansionScore } from '@/lib/utils';
import type { Filters } from '@/components/board/FilterBar';

/** Live listings — a tinted horizontal carousel row of auto-scraped mini-cards. */
export function PipelineSection({ filters }: { filters: Filters }) {
  const { pipeline, shortlistIds } = useApp();

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
      </div>
      {items.length === 0 ? (
        <p className="px-1 py-2 text-[13px] text-text-muted">No live listings match these filters.</p>
      ) : (
        <div className="h-scroll">
          {items.map((l) => <Card key={l.id} listing={l} isPipeline compact />)}
        </div>
      )}
    </section>
  );
}

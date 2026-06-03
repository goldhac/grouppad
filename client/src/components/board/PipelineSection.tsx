import { useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { Card } from '@/components/Card';
import { mansionScore } from '@/lib/utils';
import type { Filters } from '@/components/board/FilterBar';

export function PipelineSection({ filters }: { filters: Filters }) {
  const { pipeline, shortlistIds } = useApp();

  const items = useMemo(() => {
    // Pipeline intentionally ignores the "check manually" filter (legacy parity).
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
    <section className="px-4 py-3 sm:px-8">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Live Listings</h2>
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">
          Auto-refreshed every 3 days
        </span>
        <span className="text-xs text-muted">
          Pulled from VRBO & Airbnb · big homes first · {items.length} of {pipeline.length} shown
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((l) => (
          <Card key={l.id} listing={l} isPipeline />
        ))}
      </div>
    </section>
  );
}

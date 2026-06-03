import { useApp } from '@/store/AppContext';
import { Slider } from '@/components/ui/Slider';
import { fmt } from '@/lib/utils';

export interface Filters {
  under: boolean;
  pool: boolean;
  parking: boolean;
  manual: boolean;
}

export function FilterBar({
  filters,
  setFilters,
  shown,
  total,
  perPersonAvg,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  shown: number;
  total: number;
  perPersonAvg: number | null;
}) {
  const { split, setSplit } = useApp();
  const toggle = (k: keyof Filters) => setFilters({ ...filters, [k]: !filters[k] });

  return (
    <div className="sticky top-[42px] z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-panel/95 px-4 py-2.5 text-[13px] backdrop-blur sm:px-8">
      <Check label="Under budget only" checked={filters.under} onChange={() => toggle('under')} />
      <Check label="Pool required" checked={filters.pool} onChange={() => toggle('pool')} />
      <Check label="Parking required" checked={filters.parking} onChange={() => toggle('parking')} />
      <Check label='Include "check manually"' checked={filters.manual} onChange={() => toggle('manual')} />

      <span className="hidden h-4 w-px bg-border sm:block" />

      <div className="flex items-center gap-2">
        <span className="text-muted">Split:</span>
        <Slider
          min={2}
          max={30}
          step={1}
          value={[split]}
          onValueChange={(v) => setSplit(v[0])}
          className="w-32"
        />
        <span className="whitespace-nowrap text-muted">
          {split} people · {perPersonAvg != null ? `${fmt(perPersonAvg)}/ea` : '—'}
        </span>
      </div>

      <span className="ml-auto text-muted">
        {shown} of {total} listings
      </span>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-text">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-3.5 w-3.5 accent-[var(--accent)]" />
      {label}
    </label>
  );
}

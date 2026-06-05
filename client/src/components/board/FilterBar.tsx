import { Check } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { fmt } from '@/lib/utils';

export interface Filters {
  under: boolean;
  pool: boolean;
  parking: boolean;
  manual: boolean;
}

const CHIPS: { key: keyof Filters; label: string }[] = [
  { key: 'under', label: 'Under budget only' },
  { key: 'pool', label: 'Pool required' },
  { key: 'parking', label: 'Parking required' },
  { key: 'manual', label: 'Include “check manually”' },
];

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
    <div className="b-filter">
      {CHIPS.map((c) => (
        <label key={c.key} className={`chip-filter${filters[c.key] ? ' on' : ''}`}>
          <input
            type="checkbox"
            checked={filters[c.key]}
            onChange={() => toggle(c.key)}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
          />
          <span className="box"><Icon icon={Check} className="ico" /></span>
          {c.label}
        </label>
      ))}

      <div className="split">
        <span className="lab">Split</span>
        <input
          type="range"
          min={2}
          max={30}
          step={1}
          value={split}
          onChange={(e) => setSplit(Number(e.target.value))}
          aria-label="Split between this many people"
        />
        <span className="val tnum">
          {split} people{perPersonAvg != null ? ` · ${fmt(perPersonAvg)}/ea` : ''}
        </span>
      </div>

      <span className="count tnum">{shown} of {total}</span>
    </div>
  );
}

import { Check } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { fmt } from '@/lib/utils';

export interface Filters {
  under: boolean;
  pool: boolean;
  parking: boolean;
  hottub: boolean;
  manual: boolean;
  /** Minimum sleeps (0 = any). */
  sleeps: number;
}

const CHIPS: { key: 'under' | 'pool' | 'parking' | 'hottub' | 'manual'; label: string }[] = [
  { key: 'under', label: 'Under budget only' },
  { key: 'pool', label: 'Pool required' },
  { key: 'parking', label: 'Parking required' },
  { key: 'hottub', label: 'Hot tub' },
  { key: 'manual', label: 'Include “check manually”' },
];

// Filters persist per-trip in localStorage — they survive refreshes and are
// shared between the desktop board and the mobile shell. They only reset on
// sign-out (the whole store is cleared) or when the user changes them.
export const DEFAULT_FILTERS: Filters = { under: false, pool: false, parking: false, hottub: false, manual: true, sleeps: 0 };
export const FILTERS_KEY = (id?: string) => `gp_filters_${id || 'default'}`;
export function readFilters(id?: string): Filters {
  if (!id) return DEFAULT_FILTERS;
  try { const raw = localStorage.getItem(FILTERS_KEY(id)); return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS; }
  catch { return DEFAULT_FILTERS; }
}
export function writeFilters(id: string | undefined, f: Filters) {
  if (!id) return;
  try { localStorage.setItem(FILTERS_KEY(id), JSON.stringify(f)); } catch { /* ignore */ }
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
  const toggle = (k: 'under' | 'pool' | 'parking' | 'hottub' | 'manual') => setFilters({ ...filters, [k]: !filters[k] });

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

      <div className="split" style={{ gap: 8 }}>
        <span className="lab">Sleeps ≥</span>
        <input
          type="range"
          min={0}
          max={20}
          step={1}
          value={filters.sleeps}
          onChange={(e) => setFilters({ ...filters, sleeps: Number(e.target.value) })}
          aria-label="Minimum sleeps"
        />
        <span className="val tnum">{filters.sleeps || 'any'}</span>
      </div>

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

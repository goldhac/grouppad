import { useMemo } from 'react';
import { Home, ThumbsUp, Users, CheckCircle2 } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { fmt } from '@/lib/utils';
import type { Listing } from '@/types';

/** Board summary strip — a dashboard-style read of the homes in play, adapted
 *  from Watermelon's budget-card/dashboard blocks into ds2 (corner-bracket
 *  framing, a spent-vs-budget pulse). Sits atop the All-homes tab. */
export function BoardStats({ homes }: { homes: Listing[] }) {
  const { split, trip, final } = useApp();
  const budget = trip?.budget ?? 7000;
  const groupSize = Math.max(trip?.adults || trip?.memberCount || split || 1, 1);

  const s = useMemo(() => {
    const priced = homes.filter((h) => h.est_5n != null);
    const under = homes.filter((h) => h.budget === 'under' || (h.est_5n != null && h.est_5n <= budget)).length;
    const avgAllIn = priced.length ? Math.round(priced.reduce((a, h) => a + (h.est_5n || 0), 0) / priced.length) : null;
    const avgPp = avgAllIn != null ? Math.ceil(avgAllIn / split) : null;
    const cheapest = priced.length ? Math.min(...priced.map((h) => h.est_5n || Infinity)) : null;
    return { count: homes.length, under, avgAllIn, avgPp, cheapest };
  }, [homes, budget, split]);

  // Budget pulse: the average all-in against the group's budget.
  const pct = s.avgAllIn != null ? Math.min(100, Math.round((s.avgAllIn / budget) * 100)) : 0;
  const tone = s.avgAllIn == null ? 'unknown' : s.avgAllIn <= budget ? 'under' : s.avgAllIn <= budget * 1.08 ? 'marginal' : 'over';

  const tiles = [
    { icon: Home, label: 'Homes in play', value: String(s.count) },
    { icon: CheckCircle2, label: 'Under budget', value: `${s.under}/${s.count}` },
    { icon: Users, label: 'Avg / person', value: s.avgPp != null ? fmt(s.avgPp) : '—' },
    { icon: ThumbsUp, label: 'Votes in', value: `${final.total}/${groupSize}` },
  ];

  return (
    <div className="boardstats bx-frame">
      <span className="bx-corner tl" /><span className="bx-corner tr" /><span className="bx-corner bl" /><span className="bx-corner br" />

      <div className="bs-tiles">
        {tiles.map((t) => (
          <div className="bs-tile" key={t.label}>
            <Icon icon={t.icon} className="ico" />
            <div className="bs-tx">
              <span className="bs-v tnum">{t.value}</span>
              <span className="bs-l">{t.label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="bs-pulse">
        <div className="bs-pulse-head">
          <span>Average all-in vs budget</span>
          <span className="tnum">
            {s.avgAllIn != null ? fmt(s.avgAllIn) : '—'} <i>of {fmt(budget)}</i>
          </span>
        </div>
        <div className={`bp-track tone-${tone}`}>
          <div className="bp-fill" style={{ width: `${pct}%` }} />
          <span className="bp-budgetmark" />
        </div>
        <div className="bs-pulse-foot">
          {s.cheapest != null && <span>Cheapest <b className="tnum">{fmt(s.cheapest)}</b></span>}
          <span className={`bs-tag tone-${tone}`}>{tone === 'under' ? 'On track' : tone === 'marginal' ? 'At the edge' : tone === 'over' ? 'Over budget' : 'Add prices'}</span>
        </div>
      </div>
    </div>
  );
}

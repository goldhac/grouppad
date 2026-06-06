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
    return { count: homes.length, under, avgPp };
  }, [homes, budget, split]);

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
    </div>
  );
}

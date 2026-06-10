import { Users, Minus, Plus } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';

/** Compact, always-visible group-size control (sits beside Filters on web +
 *  mobile). Drives the per-person price on every card; persists per trip. */
export function SplitPill() {
  const { split, setSplit } = useApp();
  return (
    <div className="split-pill" role="group" aria-label="Split the cost between this many people" title="People sharing the cost — sets every per-person price">
      <Icon icon={Users} className="ico sp-lead" />
      <button className="sp-btn" aria-label="Fewer people" disabled={split <= 2} onClick={() => setSplit(Math.max(2, split - 1))}>
        <Icon icon={Minus} className="ico" />
      </button>
      <span className="sp-n tnum">{split}</span>
      <button className="sp-btn" aria-label="More people" disabled={split >= 30} onClick={() => setSplit(Math.min(30, split + 1))}>
        <Icon icon={Plus} className="ico" />
      </button>
    </div>
  );
}

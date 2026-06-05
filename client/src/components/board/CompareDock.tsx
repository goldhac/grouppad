import { Swords, X } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { ScoutMark, AI_NAME } from '@/components/ui/ScoutMark';
import type { CompareController } from '@/hooks/useCompare';

/** Floating action dock shown on the board when one or more cards are ticked. */
export function CompareDock({ compare }: { compare: CompareController }) {
  const { selected, clearSelection } = useApp();
  const count = selected.size;
  if (count === 0) return null;

  return (
    <div style={{ position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 40, pointerEvents: 'none' }}>
      <div className="dock" style={{ pointerEvents: 'auto' }} role="region" aria-label="Compare selection">
        <span className="count tnum">{count} selected</span>
        <button className="btn btn-ghost btn-sm" disabled={count !== 2 || compare.running} onClick={() => void compare.runSelected('1v1')}>
          <Icon icon={Swords} className="ico" /> 1v1
        </button>
        <button className="btn btn-primary btn-sm" disabled={count < 2 || compare.running} onClick={() => void compare.runSelected('multi')}>
          <ScoutMark className="ico" /> {compare.running ? 'Thinking…' : `Ask ${AI_NAME}`}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={clearSelection} aria-label="Clear selection">
          <Icon icon={X} className="ico" />
        </button>
      </div>
    </div>
  );
}

import { Sparkles, Swords } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';
import type { CompareController } from '@/hooks/useCompare';

/** Floating action dock shown on the board when one or more cards are ticked. */
export function CompareDock({ compare }: { compare: CompareController }) {
  const { selected, clearSelection } = useApp();
  const count = selected.size;
  if (count === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-panel/95 px-3 py-2 shadow-2xl backdrop-blur">
      <span className="px-1 text-sm text-muted">{count} selected</span>
      <Button
        variant="default"
        size="sm"
        disabled={count !== 2 || compare.running}
        onClick={() => void compare.runSelected('1v1')}
      >
        <Swords className="h-4 w-4" /> 1v1
      </Button>
      <Button
        variant="primary"
        size="sm"
        disabled={count < 2 || compare.running}
        onClick={() => void compare.runSelected('multi')}
      >
        <Sparkles className="h-4 w-4" /> Compare
      </Button>
      <Button variant="ghost" size="sm" onClick={clearSelection}>
        Clear
      </Button>
    </div>
  );
}

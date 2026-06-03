import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Card } from '@/components/Card';
import { useCollapsed } from '@/hooks/useCollapsed';
import { netVotes, mansionScore } from '@/lib/utils';
import { cn } from '@/lib/cn';

export function SubmittedSection() {
  const { submitted, shortlistIds, votes, trip } = useApp();
  const [open, toggle] = useCollapsed(trip?.id, 'submitted', false);

  const items = useMemo(
    () =>
      submitted
        .filter((l) => !shortlistIds.has(l.id))
        .sort(
          (a, b) =>
            netVotes(votes, b.id) - netVotes(votes, a.id) || mansionScore(b) - mansionScore(a),
        ),
    [submitted, shortlistIds, votes],
  );

  if (items.length === 0) return null;

  return (
    <section className="px-4 py-3 sm:px-8">
      <button onClick={toggle} className="mb-3 flex w-full items-center gap-2 text-left" aria-expanded={open}>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', !open && '-rotate-90')} />
        <h2 className="font-semibold">Community Submissions</h2>
        <span className="rounded-full bg-panel-2 px-1.5 text-[11px] text-muted">{items.length}</span>
        <span className="hidden text-xs text-muted sm:inline">Posted by group members — verify details before booking</span>
      </button>
      {open && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((l) => (
            <Card key={l.id} listing={l} isSubmitted />
          ))}
        </div>
      )}
    </section>
  );
}

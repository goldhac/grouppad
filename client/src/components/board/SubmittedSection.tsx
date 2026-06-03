import { useMemo } from 'react';
import { useApp } from '@/store/AppContext';
import { Card } from '@/components/Card';
import { netVotes, mansionScore } from '@/lib/utils';

export function SubmittedSection() {
  const { submitted, shortlistIds, votes } = useApp();

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
      <div className="mb-3 flex items-center gap-2">
        <h2 className="font-semibold">Community Submissions</h2>
        <span className="text-xs text-muted">Posted by group members — verify details before booking</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((l) => (
          <Card key={l.id} listing={l} isSubmitted />
        ))}
      </div>
    </section>
  );
}

import { useMemo } from 'react';
import { Sparkles, Swords } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/Card';
import { Markdown } from '@/components/Markdown';
import { netVotes, mansionScore, formatDateTime } from '@/lib/utils';
import type { CompareController } from '@/hooks/useCompare';
import type { Listing } from '@/types';

export function ShortlistSection({ compare }: { compare: CompareController }) {
  const { shortlistIds, findListing, votes, selected, insights, clearSelection } = useApp();

  const shortlist = useMemo(() => {
    const items = [...shortlistIds].map((id) => findListing(id)).filter(Boolean) as Listing[];
    return items.sort(
      (a, b) => netVotes(votes, b.id) - netVotes(votes, a.id) || mansionScore(b) - mansionScore(a),
    );
  }, [shortlistIds, findListing, votes]);

  const selCount = selected.size;

  // Staleness: server-loaded insights carry the ids they were computed from.
  const stale = useMemo(() => {
    if (!insights?.ids) return false;
    const a = [...insights.ids].sort().join(',');
    const b = [...shortlistIds].sort().join(',');
    return a !== b;
  }, [insights, shortlistIds]);

  if (shortlist.length === 0) return null;

  return (
    <section className="px-4 py-3 sm:px-8">
      <div className="rounded-lg border border-border bg-panel p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">⭐ Shortlist</span>
          <span className="text-xs text-muted">
            Liked by members & member-added homes — your group's top picks
          </span>
          <Button
            variant="default"
            size="sm"
            className="ml-auto"
            onClick={() => compare.setPanelOpen(!compare.panelOpen)}
          >
            <Sparkles className="h-4 w-4" /> Compare with AI
          </Button>
        </div>

        {compare.panelOpen && (
          <div className="mt-3 rounded-md border border-border bg-panel-2 p-3">
            <input
              type="text"
              value={compare.criteria}
              onChange={(e) => compare.setCriteria(e.target.value)}
              placeholder="Anything else to weigh? (e.g. must have hot tub, walkable, quiet street)"
              className="h-10 w-full rounded-md border border-border bg-panel px-3 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={compare.running}
                onClick={() => void compare.runWhole(shortlist)}
              >
                {compare.running ? 'Analyzing…' : 'Analyze & compare whole shortlist'}
              </Button>
            </div>

            <div className="mt-3 border-t border-border pt-3">
              <p className="text-xs text-muted">
                <Swords className="mr-1 inline h-3.5 w-3.5" />
                Or tick the <strong>compare</strong> box on cards below, then:
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">{selCount} selected</span>
                <Button
                  variant="default"
                  size="sm"
                  disabled={selCount !== 2 || compare.running}
                  onClick={() => void compare.runSelected('1v1')}
                >
                  ⚔️ 1v1 (pick exactly 2)
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  disabled={selCount < 2 || compare.running}
                  onClick={() => void compare.runSelected('multi')}
                >
                  Compare selected
                </Button>
                <Button variant="ghost" size="sm" disabled={selCount === 0} onClick={clearSelection}>
                  Clear
                </Button>
              </div>
              {compare.error && !compare.comparedListings && (
                <p className="mt-2 text-sm text-danger">{compare.error}</p>
              )}
            </div>
          </div>
        )}

        {insights?.analysis && (
          <div className="mt-3 rounded-md border border-border bg-panel-2 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              🤖 Group AI insights
              {insights.created_at && (
                <span className="font-normal text-xs text-muted">
                  updated {formatDateTime(insights.created_at)}
                </span>
              )}
            </div>
            {stale && (
              <p className="mt-1.5 rounded bg-warn/10 px-2 py-1 text-xs text-warn">
                The shortlist changed since this ran — re-run for fresh insights.
              </p>
            )}
            <Markdown className="mt-2" text={insights.analysis} />
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shortlist.map((l) => (
            <Card
              key={l.id}
              listing={l}
              isSubmitted={!!l.submitted_by}
              isPipeline={l.last_seen != null && l.rank == null && !l.submitted_by}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

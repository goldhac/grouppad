import { useMemo } from 'react';
import { Swords, Heart, Lightbulb, AlertCircle } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { ScoutMark, AI_NAME } from '@/components/ui/ScoutMark';
import { ScoutThinking } from '@/components/ui/ScoutThinking';
import { Card } from '@/components/Card';
import { Markdown } from '@/components/Markdown';
import { netVotes, mansionScore, fmt } from '@/lib/utils';
import type { CompareController } from '@/hooks/useCompare';
import type { Listing } from '@/types';

export function ShortlistSection({ compare }: { compare: CompareController }) {
  const { shortlistIds, findListing, votes, selected, insights, trip, clearSelection } = useApp();

  const shortlist = useMemo(() => {
    const items = [...shortlistIds].map((id) => findListing(id)).filter(Boolean) as Listing[];
    return items.sort((a, b) => netVotes(votes, b.id) - netVotes(votes, a.id) || mansionScore(b) - mansionScore(a));
  }, [shortlistIds, findListing, votes]);

  const selCount = selected.size;

  const stale = useMemo(() => {
    if (!insights?.ids) return false;
    return [...insights.ids].sort().join(',') !== [...shortlistIds].sort().join(',');
  }, [insights, shortlistIds]);

  // Illustrative weighing criteria (what the AI considers).
  const ppBudget = trip?.budget && trip.adults ? Math.round(trip.budget / trip.adults) : null;
  const crit = [
    ppBudget ? `Under ${fmt(ppBudget)} / person` : 'Under budget',
    'Distance to your plans',
    trip?.adults ? `Sleeps ≥ ${trip.adults}` : 'Group size fit',
    'Pool + parking',
  ];

  if (shortlist.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 py-16 text-center">
        <Icon icon={Heart} className="ico" />
        <h3 className="font-display text-lg font-semibold">No finalists yet</h3>
        <p className="max-w-sm text-sm text-text-muted">
          Homes rise here automatically when they reach <b>net +1</b> likes. Like the ones your group is into on the All homes tab.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="row-head">
        <Icon icon={Heart} className="ico-lead" />
        <span className="ttl">Shortlist</span>
        <span className="cnt tnum">{shortlist.length}</span>
        <span className="sub">liked by the group · ranked by net likes</span>
      </div>

      <div className="shortlist-wrap">
        {/* ── Sticky AI compare panel ─────────────────────────────────────── */}
        <div className="ai-panel">
          <div className="ai-head">
            <div className="spark"><ScoutMark className="ico" /></div>
            <div>
              <div className="at">{AI_NAME}</div>
              <div className="as">Your group’s AI — ranks the shortlist against your caveats</div>
            </div>
          </div>
          <div className="ai-body">
            <div className="crit">
              {crit.map((c) => <span key={c} className="c">{c}</span>)}
            </div>

            <input
              type="text"
              value={compare.criteria}
              onChange={(e) => compare.setCriteria(e.target.value)}
              placeholder="Add anything else to weigh…"
              className="field"
              style={{ fontSize: 13 }}
            />

            {insights?.analysis ? (
              <div className="insights">
                <div className="ih"><Icon icon={Lightbulb} className="ico" /> Group insight</div>
                <Markdown text={insights.analysis} />
                {stale && (
                  <div className="stale"><Icon icon={AlertCircle} className="ico" /> {shortlist.length} homes shortlisted — re-analyze to refresh.</div>
                )}
              </div>
            ) : (
              <div className="insights">
                <div className="ih"><Icon icon={Lightbulb} className="ico" /> Group insight</div>
                <p>Ask {AI_NAME} and it weighs every finalist against your budget, distances, and caveats — then explains the call.</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary btn-sm" disabled={compare.running} onClick={() => void compare.runWhole(shortlist)}>
                {compare.running ? <ScoutThinking size="sm" /> : <ScoutMark className="ico" />} {compare.running ? 'Thinking…' : `Ask ${AI_NAME} (${shortlist.length})`}
              </button>
              <button className="btn btn-ghost btn-sm" disabled={selCount !== 2 || compare.running} onClick={() => void compare.runSelected('1v1')}>
                <Icon icon={Swords} className="ico" /> 1v1
              </button>
              {selCount > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={clearSelection}>Clear ({selCount})</button>
              )}
            </div>
            {selCount >= 2 && (
              <button className="btn btn-ghost btn-sm" disabled={compare.running} onClick={() => void compare.runSelected('multi')}>
                Compare {selCount} selected
              </button>
            )}
            {compare.error && !compare.comparedListings && <p className="text-sm text-danger">{compare.error}</p>}
          </div>
        </div>

        {/* ── Finalist grid ───────────────────────────────────────────────── */}
        <div className="sl-grid">
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

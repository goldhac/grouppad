import { useEffect, useMemo, useRef, useState } from 'react';
import { Swords, Heart, Lightbulb, AlertCircle, ChevronDown } from 'lucide-react';
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
    if (!insights) return false;
    if (insights.stale) return true; // approved criteria changed since this ran
    if (!insights.ids) return false;
    return [...insights.ids].sort().join(',') !== [...shortlistIds].sort().join(',');
  }, [insights, shortlistIds]);

  // Open (and scroll to) the analysis whenever a fresh result lands — otherwise
  // "Ask Scout" appears to do nothing (the result drops into a closed drawer).
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const analysisRef = useRef<HTMLDetailsElement>(null);
  const prevAnalysis = useRef(insights?.analysis);
  useEffect(() => {
    if (insights?.analysis && insights.analysis !== prevAnalysis.current) {
      setAnalysisOpen(true);
      requestAnimationFrame(() => analysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    }
    prevAnalysis.current = insights?.analysis;
  }, [insights?.analysis]);

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
          Homes rise here automatically when they reach <b>net +1</b> likes. Like the ones your group is into on the Recommended tab.
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

      {/* ── Scout banner ──────────────────────────────────────────────────── */}
      <div className="scout-banner">
        <div className="sb-head">
          <div className="sb-mark"><ScoutMark className="ico" /></div>
          <div className="min-w-0">
            <div className="sb-t">Ask {AI_NAME} to rank your {shortlist.length} finalists</div>
            <div className="sb-s">Weighs budget, distance, and your group’s approved criteria — then explains the call.</div>
          </div>
          <div className="sb-cta">
            <button className="btn btn-primary btn-sm" disabled={compare.running} onClick={() => void compare.runWhole(shortlist)}>
              {compare.running ? <ScoutThinking size="sm" /> : <ScoutMark className="ico" />} {compare.running ? 'Thinking…' : `Ask ${AI_NAME}`}
            </button>
            {selCount === 2 && (
              <button className="btn btn-ghost btn-sm" disabled={compare.running} onClick={() => void compare.runSelected('1v1')}>
                <Icon icon={Swords} className="ico" /> 1v1
              </button>
            )}
            {selCount > 2 && (
              <button className="btn btn-ghost btn-sm" disabled={compare.running} onClick={() => void compare.runSelected('multi')}>Compare {selCount}</button>
            )}
            {selCount > 0 && <button className="btn btn-ghost btn-sm" onClick={clearSelection}>Clear ({selCount})</button>}
          </div>
        </div>
        <div className="sb-foot">
          <div className="sb-crit">{crit.map((c) => <span key={c} className="c">{c}</span>)}</div>
          <input
            type="text"
            value={compare.criteria}
            onChange={(e) => compare.setCriteria(e.target.value)}
            placeholder="Add anything else to weigh…"
            className="field"
          />
        </div>
        {compare.error && !compare.comparedListings && <p className="text-sm text-danger">{compare.error}</p>}
      </div>

      {/* ── Scout's full analysis (expandable) ────────────────────────────── */}
      {insights?.analysis && (
        <details className="scout-analysis" ref={analysisRef} open={analysisOpen} onToggle={(e) => setAnalysisOpen(e.currentTarget.open)}>
          <summary>
            <Icon icon={Lightbulb} className="ico" /> {AI_NAME}’s full analysis — top picks, comparison table & red flags
            {stale && <span className="sa-stale"><Icon icon={AlertCircle} className="ico" /> re-analyze to refresh</span>}
            <Icon icon={ChevronDown} className="ico sa-chev" />
          </summary>
          <div className="sa-body"><Markdown text={insights.analysis} /></div>
        </details>
      )}

      {/* ── Finalist grid (full width) ────────────────────────────────────── */}
      <div className="b-grid">
        {shortlist.map((l) => (
          <Card
            key={l.id}
            listing={l}
            isSubmitted={!!l.submitted_by}
            isPipeline={l.last_seen != null && l.rank == null && !l.submitted_by}
          />
        ))}
      </div>
    </section>
  );
}

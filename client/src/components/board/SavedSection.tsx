import { useMemo, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { ScoutMark, AI_NAME } from '@/components/ui/ScoutMark';
import { ScoutThinking } from '@/components/ui/ScoutThinking';
import { Card } from '@/components/Card';
import { ScoutVerdict } from '@/components/board/ScoutVerdict';
import { toInput } from '@/hooks/useCompare';
import type { ScoutVerdict as Verdict } from '@/types';

/** Each member's own saved homes — a personal shortlist, separate from the
 *  group's net-voted Shortlist. Includes a *private* "Ask Scout — for me" that
 *  ranks only your saved homes through your own lens (not shared, no approval). */
export function SavedSection() {
  const { favoriteIds, listings, submitted, pipeline, user, openAuth, runCompare, toast } = useApp();
  const [crit, setCrit] = useState('');
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [verdictMd, setVerdictMd] = useState<string | null>(null);

  const homes = useMemo(() => {
    const seen = new Set<string>();
    const out = [];
    for (const pool of [listings, submitted, pipeline]) {
      for (const l of pool) if (favoriteIds.has(l.id) && !seen.has(l.id)) { seen.add(l.id); out.push(l); }
    }
    return out;
  }, [favoriteIds, listings, submitted, pipeline]);

  async function askForMe() {
    if (homes.length < 2) { toast('Save at least 2 homes to compare them.', 'error'); return; }
    setRunning(true);
    setVerdict(null);
    setVerdictMd(null);
    try {
      const res = await runCompare(homes.map(toInput), crit ? `My personal priorities: ${crit}` : '');
      setVerdict(res.verdict ?? null);
      setVerdictMd(res.analysis);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Scout couldn’t compare right now.', 'error');
    } finally {
      setRunning(false);
    }
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Icon icon={Bookmark} className="ico" />
        <p className="text-text-muted">Sign in to save homes to your own shortlist.</p>
        <button className="btn btn-primary btn-sm" onClick={() => openAuth('save homes')}>Sign in</button>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="row-head">
        <span className="ttl">Saved</span>
        <span className="cnt tnum">{homes.length}</span>
        <span className="sub">your personal shortlist · only you see this</span>
      </div>

      {homes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Icon icon={Bookmark} className="ico" />
          <p className="text-text-muted">
            Nothing saved yet. Tap the <Icon icon={Bookmark} className="ico inline align-text-bottom" /> on any home to keep
            it here. It's your own shortlist for tracking favourites before the group locks one.
          </p>
        </div>
      ) : (
        <>
          {/* Private personal-Scout banner */}
          <div className="scout-banner">
            <div className="sb-head">
              <div className="sb-mark"><ScoutMark className="ico" /></div>
              <div className="min-w-0">
                <div className="sb-t">{AI_NAME} · just for you</div>
                <div className="sb-s">Rank your {homes.length} saved {homes.length === 1 ? 'home' : 'homes'} by what <em>you</em> care about. Private, not shared with the group.</div>
              </div>
              <div className="sb-cta">
                <button className="btn btn-primary btn-sm" disabled={running || homes.length < 2} onClick={() => void askForMe()}>
                  {running ? <ScoutThinking size="sm" /> : <ScoutMark className="ico" />} {running ? 'Thinking…' : 'Ask Scout · for me'}
                </button>
              </div>
            </div>
            <div className="sb-foot">
              <input
                type="text"
                value={crit}
                onChange={(e) => setCrit(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void askForMe()}
                placeholder="What matters most to you? e.g. quiet, near the beach, big kitchen…"
                className="field"
              />
            </div>
          </div>

          {(verdict || verdictMd) && (
            <div className="scout-analysis" style={{ paddingTop: 0 }}>
              <div className="sa-body" style={{ borderTop: 0, paddingTop: 14 }}>
                <div className="mb-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent-text">
                  <ScoutMark className="ico" /> {AI_NAME}’s pick for you
                </div>
                <ScoutVerdict verdict={verdict} fallback={verdictMd ?? undefined} />
              </div>
            </div>
          )}

          <div className="b-grid">
            {homes.map((l) => <Card key={l.id} listing={l} />)}
          </div>
        </>
      )}
    </section>
  );
}

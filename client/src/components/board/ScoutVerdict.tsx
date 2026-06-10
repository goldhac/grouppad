import { Trophy, AlertTriangle, Check } from 'lucide-react';
import type { ScoutVerdict as Verdict } from '@/types';
import { Icon } from '@/components/ui/Icon';
import { Markdown } from '@/components/Markdown';

const FIT_LABEL: Record<string, string> = { best: 'Best fit', good: 'Worth it', skip: 'Pass' };

/** Renders Scout's structured comparison. Falls back to markdown prose when the
 *  model didn't return structure (older cache or a parse miss). */
export function ScoutVerdict({ verdict, fallback }: { verdict?: Verdict | null; fallback?: string }) {
  if (!verdict || (!verdict.ranked?.length && !verdict.table?.length && !verdict.summary)) {
    return fallback ? <Markdown text={fallback} /> : null;
  }
  const { summary, winner, ranked, table, redFlags, picks } = verdict;

  return (
    <div className="sv">
      {summary && <p className="sv-summary">{summary}</p>}

      {winner?.name && (
        <div className="sv-winner">
          <span className="sv-winner-badge"><Icon icon={Trophy} className="ico" /></span>
          <div>
            <div className="sv-winner-name">{winner.name}</div>
            {winner.why && <div className="sv-winner-why">{winner.why}</div>}
          </div>
        </div>
      )}

      {!!ranked?.length && (
        <ol className="sv-ranked">
          {ranked.map((r, i) => (
            <li key={i} className={`sv-rank fit-${r.fit}`}>
              <span className="sv-rank-n">{r.n ?? i + 1}</span>
              <div className="sv-rank-body">
                <div className="sv-rank-top">
                  <span className="sv-rank-name">{r.name}</span>
                  <span className={`sv-fit fit-${r.fit}`}>{FIT_LABEL[r.fit] || r.fit}</span>
                </div>
                <div className="sv-rank-reason">{r.reason}</div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {!!picks?.length && (
        <div className="sv-picks">
          {picks.map((p, i) => (
            <div key={i} className="sv-pick">
              <span className="sv-pick-name">{p.name}</span>
              <span className="sv-pick-line">{p.line}</span>
            </div>
          ))}
        </div>
      )}

      {!!table?.length && (
        <div className="sv-table-wrap">
          <table className="sv-table">
            <thead>
              <tr><th>Home</th><th>Beds / sleeps</th><th>~All-in</th><th>Distance</th><th>Pool / hot tub</th><th>Standout</th></tr>
            </thead>
            <tbody>
              {table.map((t, i) => (
                <tr key={i}>
                  <td className="sv-td-name">{t.name}</td>
                  <td className="tnum">{t.bedsSleeps || '—'}</td>
                  <td className="tnum">{t.allIn || '—'}</td>
                  <td className="tnum">{t.distance || '—'}</td>
                  <td>{t.poolHotTub || '—'}</td>
                  <td>{t.standout || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!!redFlags?.length && (
        <div className="sv-flags">
          <div className="sv-flags-head"><Icon icon={AlertTriangle} className="ico" /> Worth a look before you commit</div>
          <ul>
            {redFlags.map((f, i) => (
              <li key={i} className={`sev-${f.severity || 'medium'}`}>
                <span className="sv-flag-dot" />
                <span><b>{f.name}:</b> {f.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!redFlags?.length && (ranked?.length || table?.length) ? (
        <div className="sv-clear"><Icon icon={Check} className="ico" /> No dealbreakers spotted.</div>
      ) : null}
    </div>
  );
}

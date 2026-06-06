import { ThumbsUp, ThumbsDown, Star, Check, MapPin, Lock } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { SafeImg } from '@/components/ui/SafeImg';
import { cn } from '@/lib/cn';
import { fmt, tallyVotes } from '@/lib/utils';
import type { Listing } from '@/types';

/** Dense list/table view of the board — the Watermelon data-table pattern
 *  (selectable rows, status pills) adapted to ds2. An alternative to the card
 *  grid for scanning many homes at once. Rows open the detail; vote + compare
 *  controls live inline. */
export function BoardTable({ homes }: { homes: Listing[] }) {
  const { user, votes, final, split, trip, selected, castVote, toggleSelect, openDetail } = useApp();
  const budget = trip?.budget ?? 7000;

  return (
    <div className="b-list" role="table" aria-label="Homes">
      <div className="bl-head" role="row">
        <span className="bl-c-home">Home</span>
        <span className="bl-c-stay">Stay</span>
        <span className="bl-c-allin">All-in vs budget</span>
        <span className="bl-c-pp">/ person</span>
        <span className="bl-c-votes">Votes</span>
        <span className="bl-c-cbx" aria-hidden />
      </div>

      {homes.map((l) => {
        const tally = tallyVotes(votes, l.id, user?.id ?? null);
        const net = tally.up - tally.down;
        const pp = l.est_5n ? Math.ceil(l.est_5n / split) : null;
        const ppOver = l.est_5n != null && l.est_5n > budget;
        const bpPct = l.est_5n != null ? Math.min(100, Math.round((l.est_5n / budget) * 100)) : 0;
        const bpTone = l.budget ?? (l.est_5n == null ? 'unknown' : l.est_5n <= budget ? 'under' : 'over');
        const isSel = selected.has(l.id);
        const isDecision = final.decision?.listing_id === l.id;

        return (
          <div
            key={l.id}
            role="row"
            tabIndex={0}
            className={cn('bl-row', isDecision && 'is-official', isSel && 'is-selected')}
            onClick={(e) => { if (!(e.target as HTMLElement).closest('button, label, input, a')) openDetail(l.id); }}
            onKeyDown={(e) => { if (e.key === 'Enter') openDetail(l.id); }}
          >
            <div className="bl-c-home bl-home">
              <div className="bl-thumb">
                <SafeImg src={l.photos?.[0] || ''} alt="" loading="lazy" />
                {isDecision && <span className="bl-lock"><Icon icon={Lock} className="ico" /></span>}
              </div>
              <div className="bl-name">
                <div className="t">
                  {l.rank != null && l.rank <= 3 && <Icon icon={Star} className="ico" />}
                  <span className="truncate">{l.name}</span>
                </div>
                <div className="m">
                  <span className="tag-source">{l.source}</span>
                  {l.area && <span>{l.area}</span>}
                  {l.distance_mi != null && <span className="inline-flex items-center gap-1"><Icon icon={MapPin} className="ico" /> {l.distance_mi} mi</span>}
                </div>
              </div>
            </div>

            <div className="bl-c-stay bl-stay">
              {l.bd != null && <span>{l.bd} bd</span>}
              {l.ba != null && <span>{l.ba} ba</span>}
              {l.sleeps != null && <span>sleeps {l.sleeps}</span>}
            </div>

            <div className="bl-c-allin bl-allin">
              <span className="amt tnum">{fmt(l.est_5n)}</span>
              {l.est_5n != null && (
                <div className={cn('bp-track', `tone-${bpTone}`)}><div className="bp-fill" style={{ width: `${bpPct}%` }} /></div>
              )}
            </div>

            <div className={cn('bl-c-pp bl-pp tnum', ppOver ? 'bad' : 'ok')}>{pp != null ? fmt(pp) : '—'}</div>

            <div className="bl-c-votes bl-votes votebar" onClick={(e) => e.stopPropagation()}>
              <button className={cn('vote up', tally.mine === 'up' && 'on')} onClick={() => void castVote(l.id, 'up')} aria-label="Like"><Icon icon={ThumbsUp} className="ico" /></button>
              <span className={cn('net tnum', net > 0 && 'pos', net < 0 && 'neg')}>{net > 0 ? `+${net}` : net}</span>
              <button className={cn('vote down', tally.mine === 'down' && 'on')} onClick={() => void castVote(l.id, 'down')} aria-label="Dislike"><Icon icon={ThumbsDown} className="ico" /></button>
            </div>

            <label className={cn('bl-c-cbx cbx bl-cbx', isSel && 'on')} onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={isSel} onChange={() => toggleSelect(l.id)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
              <span className="box"><Icon icon={Check} className="ico" /></span>
            </label>
          </div>
        );
      })}
    </div>
  );
}

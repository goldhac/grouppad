import { useMemo } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { MapPin, Swords, X, BadgeCheck } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { ScoutMark, AI_NAME } from '@/components/ui/ScoutMark';
import { ScoutThinking } from '@/components/ui/ScoutThinking';
import { SafeImg } from '@/components/ui/SafeImg';
import { ScoutVerdict } from '@/components/board/ScoutVerdict';
import { fmt } from '@/lib/utils';
import { cn } from '@/lib/cn';
import type { CompareController } from '@/hooks/useCompare';
import type { Listing } from '@/types';

const BUDGET_LABEL: Record<string, string> = { under: 'under budget', marginal: 'marginal', over: 'over budget', unknown: 'price TBD' };

/** Head-to-head / multi comparison overlay: the picked homes as columns with a
 *  VS badge (1v1), the AI verdict below. Dismisses + clears selection when done. */
export function ComparisonModal({ compare }: { compare: CompareController }) {
  const { split, trip } = useApp();
  const items = compare.comparedListings;
  const open = !!items && (compare.running || !!compare.result || !!compare.error);
  const is1v1 = compare.resultMode === '1v1' && items?.length === 2;
  const budget = trip?.budget ?? 7000;

  // Surface Scout's pick: prefer the first **bolded** name in the verdict
  // (Scout leads with the winner), fall back to the earliest-mentioned name.
  const winnerId = useMemo(() => {
    if (!items || !compare.result || compare.running) return null;
    const txt = compare.result.toLowerCase();
    const bold = compare.result.match(/\*\*(.+?)\*\*/)?.[1]?.toLowerCase().trim();
    if (bold) {
      const hit = items.find((l) => {
        const n = l.name.toLowerCase();
        return n.includes(bold) || bold.includes(n.split(/\s+/).slice(0, 2).join(' '));
      });
      if (hit) return hit.id;
    }
    let best: string | null = null, bestAt = Infinity;
    for (const l of items) {
      const at = txt.indexOf(l.name.toLowerCase());
      if (at >= 0 && at < bestAt) { bestAt = at; best = l.id; }
    }
    return best;
  }, [items, compare.result, compare.running]);

  if (!open || !items) return null;

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && compare.dismissResult()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-scrim backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="compare-modal show"
          style={{ display: 'flex' }}
          onClick={(e) => { if (e.target === e.currentTarget) compare.dismissResult(); }}
        >
          <div className="cm-card">
            <div className="cm-head">
              <span className="spark">{is1v1 ? <Icon icon={Swords} className="ico" /> : <ScoutMark className="ico" />}</span>
              <DialogPrimitive.Title asChild><h3>{is1v1 ? 'Head-to-head' : `Comparing ${items.length} homes`}</h3></DialogPrimitive.Title>
              <DialogPrimitive.Close className="btn btn-ghost btn-sm x" aria-label="Close"><Icon icon={X} className="ico" /></DialogPrimitive.Close>
            </div>

            <div className="cm-body">
              {is1v1 ? (
                <div className="vs-wrap vs-1v1">
                  <Col l={items[0]} split={split} budget={budget} win={winnerId === items[0].id} />
                  <span className="vs-badge">VS</span>
                  <Col l={items[1]} split={split} budget={budget} win={winnerId === items[1].id} />
                </div>
              ) : (
                <div className="vs-wrap vs-multi" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 3)}, 1fr)` }}>
                  {items.map((l) => <Col key={l.id} l={l} split={split} budget={budget} win={winnerId === l.id} />)}
                </div>
              )}

              {compare.running ? (
                <div className="cm-verdict"><div className="vh"><ScoutThinking size="sm" /> {AI_NAME} is thinking</div>Weighing price, distance, and your caveats…</div>
              ) : compare.result ? (
                <div className="cm-verdict">
                  <div className="vh"><ScoutMark className="ico" /> {AI_NAME}’s verdict</div>
                  <ScoutVerdict verdict={compare.verdict} fallback={compare.result} />
                </div>
              ) : compare.error ? (
                <div className="cm-verdict" style={{ background: 'var(--over-bg)', borderColor: 'var(--over-border)' }}>
                  <div className="vh" style={{ color: 'var(--over)' }}><ScoutMark className="ico" /> {AI_NAME} couldn’t compare</div>
                  {compare.error}
                </div>
              ) : null}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Col({ l, split, budget, win = false }: { l: Listing; split: number; budget: number; win?: boolean }) {
  const pp = l.est_5n ? Math.ceil(l.est_5n / split) : null;
  const ppOver = l.est_5n != null && l.est_5n > budget;
  return (
    <div className={cn('vs-col', win && 'win')}>
      <div className="ph"><SafeImg src={l.photos?.[0] || ''} alt={l.name} loading="lazy" /></div>
      <div className="vbody">
        {win && <span className="win-flag"><Icon icon={BadgeCheck} className="ico" /> {AI_NAME}’s pick</span>}
        <div className="vtitle">{l.name}</div>
        <div className="vmeta">
          <span className="tag-source">{l.source}</span>
          {l.area && <span>{l.area}</span>}
          {l.distance_mi != null && <span className="inline-flex items-center gap-1"><Icon icon={MapPin} className="ico" style={{ width: 12, height: 12 }} /> {l.distance_mi} mi</span>}
        </div>
        <div className="specs">
          {l.bd != null && <span>{l.bd} bd</span>}
          {l.ba != null && <span>{l.ba} ba</span>}
          {l.sleeps != null && <span>sleeps {l.sleeps}</span>}
        </div>
        <div className="vprice">
          <span className="amt tnum">{fmt(l.est_5n)}</span>
          <span className={`badge badge-${l.budget ?? 'unknown'}`}>{BUDGET_LABEL[l.budget ?? 'unknown']}</span>
        </div>
        {pp != null && (
          <span className={cn('perperson tnum', ppOver ? 'bad' : 'ok')} style={ppOver ? { color: 'var(--over)', background: 'var(--over-bg)' } : undefined}>
            {fmt(pp)} / person
          </span>
        )}
      </div>
    </div>
  );
}

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { MapPin, Swords, Sparkles, X, Lightbulb } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { SafeImg } from '@/components/ui/SafeImg';
import { Markdown } from '@/components/Markdown';
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
              <span className="spark"><Icon icon={is1v1 ? Swords : Sparkles} className="ico" /></span>
              <DialogPrimitive.Title asChild><h3>{is1v1 ? 'Head-to-head' : `Comparing ${items.length} homes`}</h3></DialogPrimitive.Title>
              <DialogPrimitive.Close className="btn btn-ghost btn-sm x" aria-label="Close"><Icon icon={X} className="ico" /></DialogPrimitive.Close>
            </div>

            <div className="cm-body">
              {is1v1 ? (
                <div className="vs-wrap">
                  <Col l={items[0]} split={split} budget={budget} />
                  <span className="vs-badge">VS</span>
                  <Col l={items[1]} split={split} budget={budget} />
                </div>
              ) : (
                <div className="vs-wrap" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 3)}, 1fr)` }}>
                  {items.map((l) => <Col key={l.id} l={l} split={split} budget={budget} />)}
                </div>
              )}

              {compare.running ? (
                <div className="cm-verdict"><div className="vh"><Icon icon={Sparkles} className="ico" /> Analyzing</div>Weighing price, distance, and your caveats with Gemini…</div>
              ) : compare.result ? (
                <div className="cm-verdict">
                  <div className="vh"><Icon icon={Lightbulb} className="ico" /> AI verdict</div>
                  <Markdown text={compare.result} />
                </div>
              ) : compare.error ? (
                <div className="cm-verdict" style={{ background: 'var(--over-bg)', borderColor: 'var(--over-border)' }}>
                  <div className="vh" style={{ color: 'var(--over)' }}><Icon icon={Sparkles} className="ico" /> Couldn’t compare</div>
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

function Col({ l, split, budget }: { l: Listing; split: number; budget: number }) {
  const pp = l.est_5n ? Math.ceil(l.est_5n / split) : null;
  const ppOver = l.est_5n != null && l.est_5n > budget;
  return (
    <div className="vs-col">
      <div className="ph"><SafeImg src={l.photos?.[0] || ''} alt={l.name} loading="lazy" /></div>
      <div className="vbody">
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

import { MapPin, Swords } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { Markdown } from '@/components/Markdown';
import { BudgetBadge } from '@/components/ui/Badge';
import { fmt } from '@/lib/utils';
import { cn } from '@/lib/cn';
import type { CompareController } from '@/hooks/useCompare';
import type { Listing } from '@/types';

/** Head-to-head / multi comparison overlay: the picked homes as columns with a
 *  VS divider on top, the AI analysis below. Dismisses (and clears selection)
 *  when the user is done. */
export function ComparisonModal({ compare }: { compare: CompareController }) {
  const { split } = useApp();
  const items = compare.comparedListings;
  const open = !!items && (compare.running || !!compare.result);
  const is1v1 = compare.resultMode === '1v1' && items?.length === 2;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && compare.dismissResult()}>
      <DialogContent width="max-w-3xl">
        <DialogTitle className="flex items-center gap-1.5 text-base font-bold">
          {is1v1 ? <><Swords className="h-4 w-4" aria-hidden /> Head-to-head</> : `Comparing ${items?.length ?? 0} homes`}
        </DialogTitle>

        {/* Columns with VS */}
        {items && (
          <div
            className={cn(
              'grid items-stretch gap-3',
              is1v1 ? 'grid-cols-[1fr_auto_1fr]' : 'grid-cols-2 sm:grid-cols-3',
            )}
          >
            {is1v1 ? (
              <>
                <CompareColumn listing={items[0]} split={split} />
                <div className="flex items-center justify-center">
                  <span className="rounded-full border border-border bg-panel-2 px-3 py-1 text-sm font-bold text-muted">
                    VS
                  </span>
                </div>
                <CompareColumn listing={items[1]} split={split} />
              </>
            ) : (
              items.map((l) => <CompareColumn key={l.id} listing={l} split={split} />)
            )}
          </div>
        )}

        {/* Analysis */}
        <div className="border-t border-border pt-3">
          {compare.running ? (
            <p className="py-4 text-center text-sm text-muted">Analyzing with Gemini…</p>
          ) : compare.result ? (
            <Markdown text={compare.result} />
          ) : null}
          {compare.error && <p className="text-sm text-danger">{compare.error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompareColumn({ listing: l, split }: { listing: Listing; split: number }) {
  const photo = l.photos?.[0];
  const pp = l.est_5n ? Math.ceil(l.est_5n / split) : null;
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-panel-2">
      {photo ? (
        <img src={photo} alt={l.name} className="aspect-[3/2] w-full object-cover" loading="lazy" />
      ) : (
        <div className="aspect-[3/2] w-full bg-panel" />
      )}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{l.name}</h3>
        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
          <span className="rounded bg-panel px-1.5 py-0.5">{l.source}</span>
          {l.distance_mi != null && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="h-3 w-3" /> {l.distance_mi} mi
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-2 text-[12px] text-text">
          {l.bd != null && <span>{l.bd} bd</span>}
          {l.sleeps != null && <span>sleeps {l.sleeps}</span>}
          {l.rating != null && <span className="text-muted">{l.rating}★</span>}
        </div>
        <div className="mt-auto flex items-baseline justify-between gap-1 pt-1">
          <span className="text-base font-bold">{fmt(l.est_5n)}</span>
          <BudgetBadge tier={l.budget} />
        </div>
        {pp != null && <span className="text-[11px] text-accent">{fmt(pp)}/person</span>}
      </div>
    </div>
  );
}

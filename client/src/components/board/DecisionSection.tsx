import { Trophy, Unlock, ExternalLink, BadgeCheck, Star } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';
import { fmt, formatDate } from '@/lib/utils';
import { cn } from '@/lib/cn';

export function DecisionSection() {
  const { final, isOwner, findListing, openDetail, setDecision, split } = useApp();
  const decision = final.decision;

  if (decision) {
    const l = findListing(decision.listing_id);
    return (
      <section className="px-4 py-3 sm:px-8">
        <div className="rounded-lg border border-accent bg-accent/10 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-accent">
            <BadgeCheck className="h-4 w-4" aria-hidden /> It's official — we're booking this one
            <span className="font-normal text-muted">· locked {formatDate(decision.locked_at)}</span>
          </div>
          {l && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">{l.name}</h3>
                <p className="text-sm text-muted">
                  {[l.area, fmt(l.est_5n), l.est_5n ? `${fmt(Math.ceil(l.est_5n / split))}/person` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="default" size="sm" onClick={() => openDetail(l.id)}>
                  See details
                </Button>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-link hover:underline"
                >
                  View on {l.source} <ExternalLink className="h-3.5 w-3.5" />
                </a>
                {isOwner && (
                  <Button variant="danger" size="sm" onClick={() => void setDecision(null)}>
                    <Unlock className="h-3.5 w-3.5" /> Unlock
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  const entries = Object.entries(final.counts).filter(([, n]) => n > 0);
  if (entries.length === 0) return null;
  const top = entries.sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <section className="px-4 py-3 sm:px-8">
      <div className="rounded-lg border border-border bg-panel p-5">
        <div className="flex items-center gap-2 font-semibold">
          <Trophy className="h-4 w-4 text-warn" /> Top choices so far
          <span className="font-normal text-muted">· {final.total} member(s) voted</span>
        </div>
        <div className="mt-3 space-y-2">
          {top.map(([id, n]) => {
            const l = findListing(id);
            const pct = final.total ? Math.round((n / final.total) * 100) : 0;
            const mine = final.myPick === id;
            return (
              <button
                key={id}
                onClick={() => openDetail(id)}
                className="block w-full text-left"
              >
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    {l?.name ?? id}
                    {mine && <span className="ml-2 rounded-full bg-warn/15 px-1.5 text-[10px] text-warn">your pick</span>}
                  </span>
                  <span className="shrink-0 text-muted">{n} pick(s)</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
                  <div className={cn('h-full rounded-full bg-warn')} style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted">
          Cast your single <Star className="inline h-3 w-3 align-text-bottom text-warn" aria-hidden /> Top choice on any card.
          {isOwner && ' As the organizer, use “Make official” to lock the group decision.'}
        </p>
      </div>
    </section>
  );
}

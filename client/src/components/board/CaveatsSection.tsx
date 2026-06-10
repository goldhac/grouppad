import { useState } from 'react';
import { MessageSquare, X, ChevronDown, Check, Clock } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';
import { useCollapsed } from '@/hooks/useCollapsed';
import { cn } from '@/lib/cn';

export function CaveatsSection() {
  const { caveats, isOwner, user, postCaveat, deleteCaveat, approveCaveat, trip, toast } = useApp();
  const [open, toggle] = useCollapsed(trip?.id, 'caveats', false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const approved = caveats.filter((c) => (c.status ?? 'approved') === 'approved');
  const pending = caveats.filter((c) => c.status === 'pending');

  async function send() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      await postCaveat(t);
      setText('');
      if (!isOwner) toast('Request sent. The organizer approves it before Scout weighs it.', 'success');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="px-4 py-3 sm:px-8">
      <div className="rounded-lg border border-border bg-panel p-4">
        <button onClick={toggle} className="flex w-full items-center gap-2 text-left" aria-expanded={open}>
          <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', !open && '-rotate-90')} />
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <MessageSquare className="h-4 w-4" /> Group criteria
          </span>
          <span className="rounded-full bg-panel-2 px-1.5 text-[11px] text-muted">{approved.length}</span>
          {pending.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-marginal-bg px-2 text-[11px] font-semibold text-marginal">
              <Clock className="h-3 w-3" /> {pending.length} pending
            </span>
          )}
          <span className="hidden text-xs text-muted sm:inline">
            Request a must-have. The organizer approves it, then Scout weighs it
          </span>
        </button>

        {open && (<>
          {/* Pending requests — organizer approves; members see their own status */}
          {pending.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {isOwner ? 'Pending requests · approve to feed Scout' : 'Awaiting the organizer’s approval'}
              </div>
              <div className="space-y-2">
                {[...pending].reverse().map((c) => (
                  <div key={c.id} className="flex items-start gap-2 rounded-md border border-marginal-border bg-marginal-bg/50 px-3 py-2 text-sm">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-marginal" />
                    <div className="flex-1">
                      <span className="font-semibold">{c.name}</span> <span className="text-text">{c.text}</span>
                    </div>
                    {isOwner ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold text-accent-text hover:bg-panel-2" onClick={() => void approveCaveat(c.id)} aria-label="Approve">
                          <Check className="mr-1 h-3.5 w-3.5" />Approve
                        </button>
                        <button className="text-muted hover:text-danger" onClick={() => void deleteCaveat(c.id)} aria-label="Reject">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : c.user_id === user?.id ? (
                      <span className="shrink-0 text-[11px] text-muted">Pending</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Approved criteria that Scout weighs */}
          <div className="mt-3 space-y-2">
            {approved.length === 0 && pending.length === 0 && (
              <p className="text-sm text-muted">No criteria yet. Add the must-haves your group cares about.</p>
            )}
            {[...approved].reverse().map((c) => (
              <div key={c.id} className="flex items-start gap-2 rounded-md bg-panel-2 px-3 py-2 text-sm">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-text" />
                <div className="flex-1">
                  <span className="font-semibold">{c.name}</span> <span className="text-text">{c.text}</span>
                </div>
                {isOwner && (
                  <button className="text-muted hover:text-danger" onClick={() => void deleteCaveat(c.id)} aria-label="Remove criterion">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={text}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void send()}
              placeholder={isOwner ? 'Add a criterion Scout should weigh…' : 'Request a must-have, e.g. “ground-floor room; parking is a must”'}
              className="h-10 flex-1 rounded-md border border-border bg-panel-2 px-3 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
            <Button variant="default" onClick={() => void send()} disabled={busy}>
              {isOwner ? 'Add' : 'Request'}
            </Button>
          </div>
        </>)}
      </div>
    </section>
  );
}

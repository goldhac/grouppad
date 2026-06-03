import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Play, KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';
import { money, num } from '@/lib/utils';
import { cn } from '@/lib/cn';
import type { AdminUsage } from '@/types';

export function AdminView() {
  const { adminKey, setAdminKey, runPipeline } = useApp();
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [keyDraft, setKeyDraft] = useState('');

  const load = useCallback(async () => {
    if (!adminKey) return;
    setStatus('loading');
    try {
      setUsage(await api.adminUsage(adminKey));
      setStatus('idle');
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Could not load usage.');
      setStatus('error');
    }
  }, [adminKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!adminKey) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center sm:px-8">
        <h2 className="text-xl font-bold">Admin access</h2>
        <p className="mt-2 text-sm text-muted">Enter the admin key to view usage and group pulse.</p>
        <form
          className="mt-5 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (keyDraft.trim()) await setAdminKey(keyDraft.trim());
          }}
        >
          <input
            type="password"
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            placeholder="Admin key"
            className="h-10 flex-1 rounded-md border border-border bg-panel-2 px-3 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
          <Button type="submit" variant="primary">
            <KeyRound className="h-4 w-4" /> Unlock
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">📊 Admin · API usage & group pulse</h2>
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="default" size="sm" onClick={() => void runPipeline()}>
            <Play className="h-4 w-4" /> Run pipeline
          </Button>
        </div>
      </div>

      {status === 'loading' && <p className="mt-8 text-muted">Loading usage…</p>}
      {status === 'error' && <p className="mt-8 text-danger">{errMsg}</p>}

      {usage && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <DashCard title="🤖 Gemini" tag={usage.gemini.configured ? usage.gemini.model : 'not configured'}>
            <Big value={money(usage.gemini.estCostUsd)} sub="est. this month" />
            <Rows
              rows={[
                ['Calls', num(usage.gemini.calls)],
                ['Input tokens', num(usage.gemini.promptTokens)],
                ['Output tokens', num(usage.gemini.candidatesTokens)],
              ]}
            />
            <Note>
              Estimate from ${usage.gemini.rates.inputPerM} in / ${usage.gemini.rates.outputPerM} out
              per 1M tokens.
            </Note>
          </DashCard>

          <DashCard title="🔥 Firecrawl" tag={usage.firecrawl.configured ? 'live' : 'not configured'}>
            <Big
              value={usage.firecrawl.remainingCredits != null ? num(usage.firecrawl.remainingCredits) : '—'}
              sub="credits left"
            />
            <Rows
              rows={[
                ['Plan credits', usage.firecrawl.planCredits != null ? num(usage.firecrawl.planCredits) : '—'],
                ['Scrapes this month', num(usage.firecrawl.callsThisMonth)],
              ]}
            />
          </DashCard>

          <DashCard title="🕷️ Apify" tag={usage.apify.configured ? 'live' : 'not configured'}>
            <Big
              value={money(usage.apify.spentUsd)}
              sub={`of ${usage.apify.limitUsd != null ? money(usage.apify.limitUsd) : '$5.00'} limit`}
            />
            {usage.apify.limitUsd ? <ApifyBar spent={usage.apify.spentUsd} limit={usage.apify.limitUsd} /> : null}
            <div className="mt-2 space-y-1 text-xs">
              {usage.apify.recent.slice(0, 6).map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-muted">
                  <span>{(r.startedAt || '').slice(0, 16).replace('T', ' ')}</span>
                  <span>{r.costUsd != null ? money(r.costUsd) : '—'}</span>
                  <span className={cn(r.status === 'SUCCEEDED' && 'text-accent')}>{r.status}</span>
                </div>
              ))}
              {usage.apify.recent.length === 0 && <div className="text-muted">no recent runs</div>}
            </div>
          </DashCard>

          <DashCard
            title="👥 Group pulse"
            tag={usage.group.decisionLocked ? 'decision locked ✅' : 'open'}
          >
            <Rows
              rows={[
                ['Members', num(usage.group.members)],
                ['Votes cast', num(usage.group.votes)],
                ['Top-choice picks', num(usage.group.picks)],
                ['Submissions', num(usage.group.submissions)],
              ]}
            />
            <Note>
              {usage.group.refreshedAt ? `Refreshed ${usage.group.refreshedAt} · ` : ''}month {usage.month}
            </Note>
          </DashCard>
        </div>
      )}
    </div>
  );
}

function DashCard({ title, tag, children }: { title: string; tag: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{title}</span>
        <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[11px] text-muted">{tag}</span>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Big({ value, sub }: { value: string; sub: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs text-muted">{sub}</span>
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="mt-3 space-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between">
          <span className="text-muted">{k}</span>
          <strong className="font-semibold">{v}</strong>
        </div>
      ))}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[11px] leading-relaxed text-muted">{children}</p>;
}

function ApifyBar({ spent, limit }: { spent: number | null; limit: number }) {
  const pct = spent != null ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-panel-2">
      <div className={cn('h-full rounded-full', pct >= 80 ? 'bg-danger' : 'bg-accent')} style={{ width: `${pct}%` }} />
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ShieldCheck, KeyRound, RefreshCw, Play, Sparkles, Globe, Flame,
  Home, Users, ThumbsUp, BadgeCheck, Table2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { money, num } from '@/lib/utils';
import type { AdminUsage, AdminTripRow } from '@/types';

type MeterState = 'ok' | 'warn' | 'over';
function stateOf(pct: number): MeterState { return pct >= 90 ? 'over' : pct >= 75 ? 'warn' : 'ok'; }
const STATE_LABEL: Record<MeterState, string> = { ok: 'Healthy', warn: 'Near limit', over: 'Over limit' };

function Meter({ icon, name, src, used, limit, usedLabel, limitLabel, note, configured = true }:
  { icon: typeof Sparkles; name: string; src: string; used: number; limit: number | null; usedLabel: string; limitLabel: string; note: string; configured?: boolean }) {
  const hasLimit = configured && limit != null && limit > 0;
  const pct = hasLimit ? Math.round((used / limit!) * 100) : 0;
  const st = stateOf(pct);
  return (
    <div className="meter">
      <div className="m-top">
        <div className="mi"><Icon icon={icon} className="ico" /></div>
        <div><div className="nm">{name}</div><div className="src">{src}</div></div>
        <span className={`state ${configured ? st : 'warn'}`}>{configured ? STATE_LABEL[st] : 'Not configured'}</span>
      </div>
      <div className="m-fig"><span className="v tnum">{usedLabel}</span><span className="of">of {limitLabel}</span></div>
      <div className="m-track"><div className={`m-fill ${st}`} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
      <div className="m-foot"><span>{note}</span>{hasLimit && <span className="pct tnum">{pct}% used</span>}</div>
    </div>
  );
}

export function AdminView() {
  const { adminKey, setAdminKey, runPipeline, toast } = useApp();
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [trips, setTrips] = useState<AdminTripRow[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    if (!adminKey) return;
    setStatus('loading');
    try {
      const [u, t] = await Promise.all([api.adminUsage(adminKey), api.adminTrips(adminKey).catch(() => ({ trips: [] }))]);
      setUsage(u); setTrips(t.trips); setStatus('idle');
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Could not load usage.'); setStatus('error');
    }
  }, [adminKey]);
  useEffect(() => { void load(); }, [load]);

  if (!adminKey) {
    return (
      <main className="uu-main"><div className="tp-wrap uu-wrap">
        <div className="mx-auto max-w-md py-20 text-center">
          <div className="ey" style={{ color: 'var(--accent-text)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 12 }}>Platform admin</div>
          <h1 className="mt-2 font-display text-2xl font-bold">Admin access</h1>
          <p className="mt-2 text-sm text-text-muted">Enter the super-admin key to view API spend and platform activity.</p>
          <form className="mt-5 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (keyDraft.trim()) { try { await setAdminKey(keyDraft.trim()); } catch { toast('Invalid admin key.', 'error'); } } }}>
            <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="Admin key" className="field" />
            <button type="submit" className="btn btn-primary"><Icon icon={KeyRound} className="ico" /> Unlock</button>
          </form>
        </div>
      </div></main>
    );
  }

  const g = usage?.gemini, fc = usage?.firecrawl, ap = usage?.apify, gp = usage?.group;
  const fcUsed = fc && fc.planCredits != null && fc.remainingCredits != null ? fc.planCredits - fc.remainingCredits : 0;

  return (
    <main className="uu-main"><div className="tp-wrap uu-wrap">
      <Link className="uu-back" to="/trips"><Icon icon={ArrowLeft} className="ico" /> Back to app</Link>

      <div className="adm-head">
        <div>
          <div className="ey">Platform admin</div>
          <h1>Usage &amp; pulse</h1>
          <div className="sub">Internal meter for API spend and platform activity. Read-only.</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="keytag"><Icon icon={ShieldCheck} className="ico" /> Admin key verified</span>
          <button className="btn btn-ghost btn-sm" onClick={() => void load()}><Icon icon={RefreshCw} className="ico" /> Refresh</button>
          <button className="btn btn-ghost btn-sm" disabled={running} onClick={async () => { setRunning(true); try { await runPipeline(); toast('Pipeline started.', 'success'); } catch (e) { toast(e instanceof Error ? e.message : 'Could not start pipeline.', 'error'); } finally { setRunning(false); } }}>
            <Icon icon={Play} className="ico" /> Run pipeline
          </button>
        </div>
      </div>

      {status === 'loading' && !usage && <p className="text-text-muted">Loading usage…</p>}
      {status === 'error' && <p className="text-danger">{errMsg}</p>}

      {usage && (
        <>
          <div className="meters">
            <Meter
              icon={Sparkles} name="Gemini" src={g!.configured ? `AI compare · ${g!.model}` : 'AI compare · geocoding'}
              configured={g!.configured}
              used={g!.estCostUsd} limit={GEMINI_SOFT_BUDGET}
              usedLabel={money(g!.estCostUsd)} limitLabel={`$${GEMINI_SOFT_BUDGET} / mo · soft`}
              note={`${num(g!.totalTokens)} tokens · ${num(g!.calls)} calls this month`}
            />
            <Meter
              icon={Globe} name="Apify spend" src="rental search runs"
              configured={ap!.configured}
              used={ap!.spentUsd ?? 0} limit={ap!.limitUsd ?? null}
              usedLabel={money(ap!.spentUsd)} limitLabel={`${money(ap!.limitUsd)} / mo`}
              note="Alert emailed at 90%"
            />
            <Meter
              icon={Flame} name="Firecrawl credits" src="price scrapes"
              configured={fc!.configured}
              used={fcUsed} limit={fc!.planCredits ?? null}
              usedLabel={num(fcUsed)} limitLabel={`${fc!.planCredits != null ? num(fc!.planCredits) : '—'} credits`}
              note={`${num(fc!.callsThisMonth)} scrapes this month`}
            />
          </div>

          <div className="adm-pulse">
            <div className="pstat2"><Icon icon={Home} className="ic" /><div className="v tnum">{num(gp!.trips ?? trips.length)}</div><div className="l">Trips</div></div>
            <div className="pstat2"><Icon icon={Users} className="ic" /><div className="v tnum">{num(gp!.members)}</div><div className="l">Members</div></div>
            <div className="pstat2"><Icon icon={ThumbsUp} className="ic" /><div className="v tnum">{num(gp!.votes)}</div><div className="l">Votes cast</div></div>
            <div className="pstat2"><Icon icon={BadgeCheck} className="ic" /><div className="v tnum">{num(gp!.picks)}</div><div className="l">Top-choice picks</div></div>
          </div>

          <div className="adm-tablewrap">
            <div className="t-h"><Icon icon={Table2} className="ico" /><h2>Trips</h2><span className="cnt">engagement per trip · per-trip API cost isn’t metered</span></div>
            <div className="adm-table-scroll">
              <table className="adm-table">
                <thead><tr>
                  <th>Trip</th><th className="num">Members</th><th className="num">Homes</th><th className="num">Votes</th><th>Official pick</th>
                </tr></thead>
                <tbody>
                  {trips.map((t) => (
                    <tr key={t.id}>
                      <td><span className="tname"><span className="dot" style={{ background: t.state === 'locked' ? 'var(--gold-dot)' : t.state === 'active' ? 'var(--under)' : 'var(--text-muted)' }} />{t.name}</span></td>
                      <td className="num tnum">{t.members}</td>
                      <td className="num tnum">{t.homes}</td>
                      <td className="num tnum">{t.votes}</td>
                      <td>{t.locked ? <span className="pick" style={{ color: 'var(--accent-text)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon icon={BadgeCheck} className="ico" /> Locked</span> : <span className="pick no" style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    </tr>
                  ))}
                  {trips.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--text-muted)' }}>No trips yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div></main>
  );
}

const GEMINI_SOFT_BUDGET = 25;

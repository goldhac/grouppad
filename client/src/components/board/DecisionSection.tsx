import { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy, Unlock, ExternalLink, Lock, Star, Users } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { SealMark } from '@/components/ui/SealMark';
import { fmt, formatDate } from '@/lib/utils';

export function DecisionSection() {
  const { final, roster, isOwner, findListing, openDetail, setDecision, split, trip } = useApp();
  const decision = final.decision;
  // Map a list of member ids → roster entries (for transparent top-pick avatars).
  const membersOf = (ids: string[] | undefined) =>
    (ids ?? []).map((uid) => roster.find((m) => m.id === uid)).filter((m): m is NonNullable<typeof m> => !!m);
  // Everyone who has cast a top choice (across all homes), unique.
  const allPickers = membersOf([...new Set(Object.values(final.pickers ?? {}).flat())]);

  // Fire the seal stamp once, the moment a decision is freshly locked (not on
  // every render of an already-locked board, and not for an unlock).
  const [sealPlay, setSealPlay] = useState(false);
  const prevId = useRef<string | null>(decision?.listing_id ?? null);
  useEffect(() => {
    const id = decision?.listing_id ?? null;
    if (id && id !== prevId.current) {
      setSealPlay(true);
      const t = setTimeout(() => setSealPlay(false), 1400);
      prevId.current = id;
      return () => clearTimeout(t);
    }
    prevId.current = id;
  }, [decision?.listing_id]);

  const entries = useMemo(
    () => Object.entries(final.counts || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 6),
    [final.counts],
  );
  const max = entries[0]?.[1] || 1;
  const leaderId = entries[0]?.[0] || null;
  const groupSize = Math.max(trip?.adults || trip?.memberCount || 1, 1);

  // ── Locked: official-pick banner ──────────────────────────────────────────
  const lockedListing = decision ? findListing(decision.listing_id) : null;

  return (
    <div className="decision-grid">
      {/* LEFT — official banner (if locked) + leaderboard */}
      <div className="flex flex-col gap-5">
        {decision && lockedListing && (
          <div className="official-banner">
            <SealMark size={56} play={sealPlay} className="ob-seal" />
            <div className="ob-body">
              <span className="ob-kicker"><span className="gold-dot" /> Official pick · locked {formatDate(decision.locked_at)}</span>
              <div className="ob-title">{lockedListing.name}</div>
              <div className="ob-meta">
                {lockedListing.area && <span>{lockedListing.area}</span>}
                {lockedListing.est_5n && <span className="tnum">{fmt(lockedListing.est_5n)} all-in</span>}
                {lockedListing.est_5n && <span className="tnum">{fmt(Math.ceil(lockedListing.est_5n / split))}/person</span>}
              </div>
            </div>
            <div className="ob-actions flex items-center gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => openDetail(lockedListing.id)}>Details</button>
              {isOwner && (
                <button className="btn btn-ghost btn-sm" onClick={() => void setDecision(null)}>
                  <Icon icon={Unlock} className="ico" /> Unlock
                </button>
              )}
            </div>
          </div>
        )}

        <div className="leaderboard">
          <div className="lb-head">
            <span className="lb-title">Top-choice leaderboard</span>
            <span className="lb-sub">{final.total} of {groupSize} cast a top choice</span>
          </div>

          {entries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Icon icon={Trophy} className="ico" />
              <p className="text-sm text-text-muted">
                No top choices yet. Cast your single <Icon icon={Star} className="ico inline align-text-bottom" /> Top
                choice on any card, and the group’s favourite rises here.
              </p>
            </div>
          ) : (
            <div className="mt-2">
              {entries.map(([id, n], i) => {
                const l = findListing(id);
                const pct = Math.round((n / max) * 100);
                const mine = final.myPick === id;
                return (
                  <div key={id} className={`lb-bar${i === 0 ? ' lead' : ''}`}>
                    <span className="rk">{i + 1}</span>
                    <div className="lb-row2">
                      <button className="lb-name" onClick={() => openDetail(id)} style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
                        {i === 0 && <Icon icon={Star} className="ico" />}
                        <span className="truncate">{l?.name ?? id}</span>
                        {mine && <span className="text-[10px] font-semibold text-accent-text">· your pick</span>}
                      </button>
                      <div className="lb-track"><div className="lb-fill" style={{ width: `${pct}%` }} /></div>
                      {(() => { const who = membersOf(final.pickers?.[id]); return who.length > 0 && (
                        <span className="lb-pickers" title={`Picked by ${who.map((m) => m.name).join(', ')}`}>
                          {who.slice(0, 5).map((m) => <span className="vw-av" key={m.id}><Avatar name={m.name} avatar={m.avatar} size={20} /></span>)}
                          {who.length > 5 && <span className="vw-more tnum">+{who.length - 5}</span>}
                        </span>
                      ); })()}
                    </div>
                    <span className="lb-tally">{n} <span>pick{n === 1 ? '' : 's'}</span></span>
                  </div>
                );
              })}
            </div>
          )}

          {isOwner && !decision && leaderId && (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-text-muted">Lock the group’s decision when you’re ready.</p>
              <button className="btn btn-primary btn-sm" onClick={() => void setDecision(leaderId)}>
                <Icon icon={Lock} className="ico" /> Make official
              </button>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — who's voted */}
      <div className="panel">
        <div className="panel-head" style={{ cursor: 'default' }}>
          <Icon icon={Users} className="ico-lead" />
          <span className="ttl">Who’s voted</span>
          <span className="cnt tnum">{final.total}/{groupSize}</span>
        </div>
        <div className="panel-body">
          {final.total === 0 ? (
            <p className="text-sm text-text-muted">No one’s cast a top choice yet. Once your group votes, you’ll see momentum build here.</p>
          ) : (
            <div className="voters">
              {allPickers.length > 0 && (
                <span className="voters-mini" style={{ display: 'inline-flex' }}>
                  {allPickers.slice(0, 6).map((m, i) => (
                    <span key={m.id} className="av" style={{ marginLeft: i ? -7 : 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--surface-raised)' }}>
                      <Avatar name={m.name} avatar={m.avatar} size={26} />
                    </span>
                  ))}
                  {allPickers.length > 6 && <span className="vw-more tnum" style={{ marginLeft: 6 }}>+{allPickers.length - 6}</span>}
                </span>
              )}
              <span className="vlabel">{final.total} of {groupSize} have picked a favourite</span>
            </div>
          )}
          {lockedListing && (
            <a href={lockedListing.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm text-link hover:underline">
              View the pick on {lockedListing.source} <Icon icon={ExternalLink} className="ico" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

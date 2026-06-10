import { useMemo } from 'react';
import { Vote, Trophy, Lock } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { ScoutMark, AI_NAME } from '@/components/ui/ScoutMark';
import { SafeImg } from '@/components/ui/SafeImg';
import { fmt } from '@/lib/utils';
import type { Listing } from '@/types';

/** The ever-present decision/progress strip: how many have cast a top choice,
 *  the current leader, who's voted, and the jump-to-decision / compare actions. */
export function DecisionStrip({
  onLeaderboard,
  onCompare,
}: {
  onLeaderboard: () => void;
  onCompare: () => void;
}) {
  const { trip, pooledListings, votes, final, split, openDetail, findListing } = useApp();
  if (!trip) return null;

  // Full deduped pool (community + live + curated) — a leader or locked pick on
  // a pipeline home must resolve too. findListing is alias-aware for old ids.
  const all = pooledListings;
  const find = (id: string): Listing | undefined => findListing(id);

  // Group size = guests; voted = people who cast a top choice (one each → final.total).
  const groupSize = Math.max(trip.adults || trip.memberCount || 1, 1);
  const voted = Math.min(final.total || 0, groupSize);
  const pct = Math.round((voted / groupSize) * 100);

  // Leader = top of the final-vote tally; fall back to the highest net up-votes.
  const leaderId = useMemo(() => {
    const counts = final.counts || {};
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (ranked.length && ranked[0][1] > 0) return ranked[0][0];
    let best: string | null = null, bestNet = 0;
    for (const l of all) {
      const v = votes[l.id] || {};
      let net = 0;
      for (const k in v) net += v[k] === 'up' ? 1 : -1;
      if (net > bestNet) { bestNet = net; best = l.id; }
    }
    return best;
  }, [final.counts, all, votes]);

  const locked = final.decision?.listing_id ? find(final.decision.listing_id) : null;
  const leader = locked || (leaderId ? find(leaderId) : null);
  const leaderVotes = leader ? (final.counts?.[leader.id] || 0) : 0;
  const perPerson = leader?.est_5n ? Math.ceil(leader.est_5n / split) : null;

  // Voter avatars — we only have counts, so render anonymised chips up to 5.
  const avatarN = Math.min(voted, 5);
  const moreN = voted - avatarN;

  return (
    <div className={`strip${locked ? ' locked' : ''}`}>
      {locked ? (
        <div className="seal" aria-hidden><Icon icon={Lock} className="ico" /></div>
      ) : (
        <div className="sk">
          <span className="lab">
            <Icon icon={Vote} className="ico" /> Group decision · <span className="n tnum">{voted} of {groupSize} voted</span>
          </span>
          <div className="ptrack"><div className="pfill" style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      {leader ? (
        <button className="lead" onClick={() => openDetail(leader.id)} style={{ background: 'none', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}>
          <SafeImg className="thumb" src={leader.photos?.[0] || ''} alt="" />
          <div className="who">
            <div className="k">{locked ? <><span className="gd" /> Official pick</> : 'Current leader'}</div>
            <div className="nm">{leader.name}</div>
            <div className="sub">
              {leaderVotes > 0 && <>{leaderVotes} top vote{leaderVotes === 1 ? '' : 's'} · </>}
              {perPerson != null ? <span className="tnum">{fmt(perPerson)}/person</span> : 'price TBD'}
            </div>
          </div>
        </button>
      ) : (
        <div className="lead" style={{ borderLeft: '1px solid var(--border)' }}>
          <div className="who"><div className="sub">No leader yet — like homes to build the shortlist.</div></div>
        </div>
      )}

      <div className="s-actions">
        {voted > 0 && (
          <span className="voters-mini" aria-label={`${voted} voted`}>
            {Array.from({ length: avatarN }).map((_, i) => <span key={i} className="av" />)}
            {moreN > 0 && <span className="av more">+{moreN}</span>}
          </span>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onLeaderboard}>
          <Icon icon={Trophy} className="ico" /> Leaderboard
        </button>
        <button className="btn btn-primary btn-sm" onClick={onCompare}>
          <ScoutMark className="ico" /> Ask {AI_NAME}
        </button>
      </div>
    </div>
  );
}

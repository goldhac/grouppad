import { useEffect, useState } from 'react';
import {
  LayoutGrid, ThumbsUp, ThumbsDown, Star, Users, Swords, BadgeCheck, ArrowUp, Circle, Lock,
} from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { SignatureIcon } from '@/components/ui/SignatureIcon';
import { ScoutMark } from '@/components/ui/ScoutMark';
import { SafeImg } from '@/components/ui/SafeImg';
import { SealMark } from '@/components/ui/SealMark';
import { cn } from '@/lib/cn';

const DUR = 4400;
const SCENES = 4;
const EST = 5022;
const IMG = (id: string) => `https://images.unsplash.com/photo-${id}?w=520&q=80&auto=format&fit=crop`;

type Mini = { img: string; name: string; price: string; pp: string; bud: string; budLabel: string; rank?: string; over?: boolean };
const BROWSE: Mini[] = [
  { img: '1600585154340-be6161a56a0c', name: 'Huge 7BR Pad · Downtown', price: '$5,022', pp: '$359', bud: 'under', budLabel: 'under', rank: '1' },
  { img: '1600585152220-90363fe7e115', name: 'Spectacular mansion', price: '$5,766', pp: '$412', bud: 'under', budLabel: 'under', rank: '2' },
  { img: '1600566753086-00f18fb6b3ea', name: 'Starbase Azusa', price: '$6,065', pp: '$434', bud: 'under', budLabel: 'under', rank: '3' },
  { img: '1600607687939-ce8a6c25118c', name: 'Modern LA 9BR', price: '$10,060', pp: '$719', bud: 'over', budLabel: 'over', over: true },
  { img: '1600047509807-ba8f99d2cdde', name: 'Sunset Strip 6BR', price: '$5,540', pp: '$396', bud: 'under', budLabel: 'under' },
  { img: '1564013799919-ab600027ffc6', name: 'Venice Canal House', price: '$7,140', pp: '$510', bud: 'marginal', budLabel: 'marginal' },
];
const STEPS: { label: string; Mark: (p: { className?: string }) => JSX.Element }[] = [
  { label: 'Browse', Mark: (p) => <Icon icon={LayoutGrid} {...p} /> },
  { label: 'Vote', Mark: (p) => <Icon icon={ThumbsUp} {...p} /> },
  { label: 'Compare', Mark: (p) => <ScoutMark {...p} /> },
  { label: 'Lock', Mark: (p) => <Icon icon={Lock} {...p} /> },
];

function MiniCard(o: Mini) {
  return (
    <article className="card">
      <div className="photo">
        <SafeImg src={IMG(o.img)} alt="" />
        {o.rank && <span className="dm-rank">{o.rank}</span>}
        <div className="dots"><i className="act" /><i /><i /></div>
      </div>
      <div className="body">
        <div className="badge-row"><span className={`badge badge-${o.bud}`}>{o.budLabel}</span></div>
        <h3 className="title">{o.name}</h3>
        <div className="price"><span className="amt tnum">{o.price}</span></div>
        <div className={cn('perperson tnum', o.over ? 'bad' : 'ok')}><Icon icon={Users} size="sm" className="ico" /> {o.pp} / person</div>
      </div>
    </article>
  );
}

export function CoreLoopDemo() {
  const [scene, setScene] = useState(0);
  const [mine, setMine] = useState(false);
  const [splitN, setSplitN] = useState(14);
  const [interacted, setInteracted] = useState(false);
  const [hover, setHover] = useState(false);
  const [pop, setPop] = useState(0);

  const paused = interacted || hover;

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setScene((s) => (s + 1) % SCENES), DUR);
    return () => clearTimeout(t);
  }, [scene, paused]);

  const net = 4 + (mine ? 1 : 0);
  const pp = '$' + Math.round(EST / splitN).toLocaleString('en-US');

  return (
    <div
      className="demo-panel"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="dm-chrome">
        <span className="dm-d" /><span className="dm-d" /><span className="dm-d" />
        <span className="dm-url">grouppad.app/t/los-angeles</span>
        <span className="dm-live"><Icon icon={Circle} size="sm" className="ico" /> live board</span>
      </div>

      <div className="dm-stagewrap">
        {/* 1 — BROWSE */}
        <section className={cn('dm-scene', scene === 0 && 'on')} data-scene="0">
          <div className="dm-scene-h"><Icon icon={LayoutGrid} size="sm" className="ico" /> All homes <span className="dm-ct tnum">14 homes · 3 under budget</span></div>
          <div className="dm-grid">{BROWSE.map((c) => <MiniCard key={c.name} {...c} />)}</div>
        </section>

        {/* 2 — VOTE */}
        <section className={cn('dm-scene', scene === 1 && 'on')} data-scene="1">
          <div className="dm-scene-h"><Icon icon={ThumbsUp} size="sm" className="ico" /> Your group votes <span className="dm-ct">tap the thumb →</span></div>
          <div className="dm-votewrap">
            <article className="card dm-bigcard">
              <div className="photo">
                <SafeImg src={IMG('1600585154340-be6161a56a0c')} alt="" />
                {mine && <span className="dm-rose"><Icon icon={ArrowUp} size="sm" className="ico" /> Rose to shortlist</span>}
                <div className="dots"><i className="act" /><i /><i /></div>
              </div>
              <div className="body">
                <div className="badge-row">
                  <span className="badge badge-rank"><Icon icon={Star} size="sm" className="ico" /> Rank 1</span>
                  <span className="badge badge-under">under budget</span>
                </div>
                <h3 className="title">Huge 7BR Pad · Downtown 15m</h3>
                <div className="price"><span className="amt tnum">$5,022</span><span className="cap">est all-in · 5 nights</span></div>
                <div className="perperson ok tnum">{pp} / person</div>
                <div className="dm-vote-row">
                  <div className="votebar">
                    <button className={cn('vote up', mine && 'on')} onClick={() => { setMine((m) => !m); setInteracted(true); setPop((p) => p + 1); }} aria-label="Like">
                      <Icon icon={ThumbsUp} size="sm" className="ico" />
                    </button>
                    <span key={pop} className={cn('net pos tnum', pop && 'pop')}>{'+' + net}</span>
                    <button className="vote down" aria-label="Dislike"><Icon icon={ThumbsDown} size="sm" className="ico" /></button>
                  </div>
                  <div className="voters">
                    <span className="avstack">
                      <span className="av">MA</span>
                      <span className="av" style={{ background: 'var(--c-indigo-600)' }}>JL</span>
                      <span className="av" style={{ background: 'var(--c-cyan-600)' }}>RP</span>
                      <span className="av more">{mine ? '+3' : '+2'}</span>
                    </span>
                  </div>
                </div>
                <div className="dm-split">
                  <span className="lab">Split <b className="tnum">{splitN}</b> ways</span>
                  <input type="range" min={2} max={20} value={splitN} onChange={(e) => { setSplitN(+e.target.value); setInteracted(true); }} aria-label="Group size" />
                </div>
              </div>
            </article>
          </div>
        </section>

        {/* 3 — COMPARE */}
        <section className={cn('dm-scene', scene === 2 && 'on')} data-scene="2">
          <div className="dm-scene-h"><Icon icon={Swords} size="sm" className="ico" /> Settle it head-to-head</div>
          <div className="vs-wrap dm-vs">
            <span className="vs-badge">VS</span>
            <div className="vs-col win">
              <div className="ph"><SafeImg src={IMG('1600585154340-be6161a56a0c')} alt="" /></div>
              <div className="vbody">
                <span className="win-flag"><Icon icon={BadgeCheck} size="sm" className="ico" /> AI winner</span>
                <div className="vtitle">Huge 7BR Pad</div>
                <div className="vprice"><span className="amt tnum">$5,022</span><span className="badge badge-under">under</span></div>
                <div className="perperson ok tnum"><Icon icon={Users} size="sm" className="ico" /> $359 / person</div>
              </div>
            </div>
            <div className="vs-col">
              <div className="ph"><SafeImg src={IMG('1600585152220-90363fe7e115')} alt="" /></div>
              <div className="vbody" style={{ paddingTop: 26 }}>
                <div className="vtitle">Spectacular mansion</div>
                <div className="vprice"><span className="amt tnum">$5,766</span><span className="badge badge-under">under</span></div>
                <div className="perperson ok tnum"><Icon icon={Users} size="sm" className="ico" /> $412 / person</div>
              </div>
            </div>
          </div>
          <div className="dm-verdict">
            <span className="vh"><SignatureIcon name="scout" className="ico" /> Scout’s verdict</span> <b>Huge 7BR Pad</b> wins — $53/person cheaper, 20 min closer to downtown, and the only one with a pool <i>and</i> Superhost.
          </div>
        </section>

        {/* 4 — LOCK */}
        <section className={cn('dm-scene', scene === 3 && 'on')} data-scene="3">
          <div className="dm-lock">
            <SealMark size={72} play={scene === 3} className="dm-seal-lottie" />
            <div className="official-banner">
              <div className="seal"><Icon icon={BadgeCheck} size="md" className="ico" /></div>
              <div className="ob-body">
                <span className="ob-kicker"><span className="gold-dot" /> Official pick · locked by Gold</span>
                <div className="ob-title">Huge 7BR Pad · Downtown 15m</div>
                <div className="ob-meta"><span className="tnum">$5,022 all-in</span><span className="tnum">$359 / person</span><span>5 votes</span></div>
              </div>
            </div>
            <div className="dm-lockcap">From 14 scattered links to one locked pick.</div>
          </div>
        </section>
      </div>

      <div className="dm-steps">
        {STEPS.map((s, k) => (
          <button
            key={s.label}
            className={cn('dm-step', k === scene && 'on', k < scene && 'done')}
            onClick={() => setScene(k)}
          >
            <span
              className={cn('dm-sd', k === scene && 'fill')}
              style={k === scene ? { animationPlayState: paused ? 'paused' : 'running' } : undefined}
            />
            <span className="dm-lab"><s.Mark className="ico" /> {s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

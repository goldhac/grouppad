import React from 'react';
import {
  AbsoluteFill, Audio, Img, staticFile, useCurrentFrame, useVideoConfig,
  interpolate, spring, Easing, random,
} from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { C, display, sans, Mark } from './theme';
import { SCENES, FPS, sceneFrames } from './voiceover-config';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const sceneById = (id: string) => SCENES.find((s) => s.id === id)!;
const framesOf = (id: string) => sceneFrames(sceneById(id));

// ── Shared building blocks ─────────────────────────────────────────────────────

// Fade + lift a child in over `dur` frames starting at `delay`.
const Reveal: React.FC<{ delay?: number; dur?: number; y?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ delay = 0, dur = 18, y = 28, children, style }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + dur], [0, 1], clamp);
  const ty = interpolate(frame, [delay, delay + dur], [y, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  return <div style={{ opacity: o, transform: `translateY(${ty}px)`, ...style }}>{children}</div>;
};

// Lower-third caption. Since the film has no voiceover, the caption carries the
// narrative — kinetic, legible over screenshots, fades in and out per scene.
const Caption: React.FC<{ text: string; sceneFramesLen: number; accent?: string }> = ({ text, sceneFramesLen, accent }) => {
  const frame = useCurrentFrame();
  const inO = interpolate(frame, [4, 18], [0, 1], clamp);
  const outO = interpolate(frame, [sceneFramesLen - 14, sceneFramesLen - 2], [1, 0], clamp);
  const o = Math.min(inO, outO);
  const ty = interpolate(frame, [4, 22], [26, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 84, display: 'flex', justifyContent: 'center', opacity: o, transform: `translateY(${ty}px)` }}>
      <div style={{ maxWidth: 1180, textAlign: 'center', padding: '20px 40px', borderRadius: 22, background: 'rgba(11,23,20,0.72)', border: '1px solid rgba(236,243,241,0.12)', backdropFilter: 'blur(8px)', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ fontFamily: display, fontSize: 46, fontWeight: 700, color: C.cream, letterSpacing: '-0.01em', lineHeight: 1.18 }}>
          {text}
        </div>
        {accent && <div style={{ height: 4, width: 64, borderRadius: 4, background: accent, margin: '16px auto 0' }} />}
      </div>
    </div>
  );
};

// A real screenshot inside a browser-chrome frame, with a slow Ken Burns push-in.
const ScreenFrame: React.FC<{ src: string; from?: number; to?: number; focusX?: number; focusY?: number; width?: number; top?: number }> = ({ src, from = 1.0, to = 1.08, focusX = 50, focusY = 30, width = 1480, top = 120 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scale = interpolate(frame, [0, durationInFrames], [from, to], clamp);
  return (
    <div style={{ position: 'absolute', top, left: '50%', transform: 'translateX(-50%)', width, borderRadius: 20, overflow: 'hidden', border: `1px solid rgba(236,243,241,0.14)`, boxShadow: '0 60px 140px rgba(0,0,0,0.5)' }}>
      <div style={{ height: 44, background: '#0c1411', display: 'flex', alignItems: 'center', gap: 9, paddingLeft: 18 }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
        <div style={{ marginLeft: 16, height: 24, flex: 1, maxWidth: 520, background: 'rgba(255,255,255,0.06)', borderRadius: 8 }} />
      </div>
      <div style={{ overflow: 'hidden' }}>
        <Img src={staticFile(src)} style={{ width: '100%', display: 'block', transform: `scale(${scale})`, transformOrigin: `${focusX}% ${focusY}%` }} />
      </div>
    </div>
  );
};

const eyebrow = (text: string, color = C.tealLight): React.ReactNode => (
  <div style={{ color, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 24 }}>{text}</div>
);

// ── Scene 1 — Hook (motion graphic) ─────────────────────────────────────────────
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const bubbles = new Array(13).fill(0).map((_, i) => i);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 10%, #1a5f59 0%, ${C.teal} 60%, #0f3b38 100%)`, fontFamily: sans, overflow: 'hidden' }}>
      {bubbles.map((i) => {
        const seed = `b${i}`;
        const x = 140 + random(seed + 'x') * 1640;
        const startF = 4 + i * 3;
        const rise = interpolate(frame, [startF, startF + 46], [1180, 120 + random(seed + 'y') * 560], { ...clamp, easing: Easing.out(Easing.cubic) });
        const o = interpolate(frame, [startF, startF + 14, 70, 88], [0, 0.85, 0.85, 0], clamp);
        const w = 130 + random(seed + 'w') * 170;
        const rot = (random(seed + 'r') - 0.5) * 14;
        const gold = i % 5 === 0;
        return <div key={i} style={{ position: 'absolute', left: x, top: rise, width: w, height: 46, borderRadius: 24, background: gold ? C.gold : 'rgba(236,243,241,0.14)', border: `1px solid rgba(236,243,241,${gold ? 0 : 0.22})`, opacity: o, transform: `rotate(${rot}deg)` }} />;
      })}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <Reveal delay={18} dur={20}>
          <div style={{ fontFamily: display, fontSize: 96, fontWeight: 800, color: C.cream, letterSpacing: '-0.025em', lineHeight: 1.05 }}>
            Planning a trip<br />with friends?
          </div>
        </Reveal>
        <Reveal delay={40} dur={18}>
          <div style={{ fontSize: 42, color: C.tealLight, marginTop: 26 }}>It always dies in the group chat.</div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── Scene 2 — One board (real screenshot) ────────────────────────────────────────
const BoardScene: React.FC = () => (
  <AbsoluteFill style={{ background: C.teal, fontFamily: sans }}>
    <Reveal delay={4} dur={16} style={{ position: 'absolute', top: 52, left: 0, right: 0, textAlign: 'center' }}>
      {eyebrow('One shared board')}
    </Reveal>
    <ScreenFrame src="shots/board-top.png" from={1.02} to={1.1} focusX={50} focusY={18} width={1500} top={104} />
  </AbsoluteFill>
);

// ── Scene 3 — Per-person price (real card) ───────────────────────────────────────
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const PerPersonScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 6, fps, config: { damping: 200 } });
  const cardScale = interpolate(pop, [0, 1], [0.92, 1]);
  // count the per-person figure up from 0 to the real $298
  const per = Math.round(interpolate(frame, [18, 52], [0, 298], { ...clamp, easing: Easing.out(Easing.cubic) }));
  const ringPulse = 1 + 0.06 * Math.sin(frame / 7);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 30% 20%, #18564f, ${C.teal})`, fontFamily: sans, justifyContent: 'center', alignItems: 'center' }}>
      <Reveal delay={2} dur={16} style={{ position: 'absolute', top: 64, left: 0, right: 0, textAlign: 'center' }}>{eyebrow('Real per-person cost')}</Reveal>
      <div style={{ display: 'flex', alignItems: 'center', gap: 80, marginTop: 10 }}>
        {/* real card */}
        <div style={{ transform: `scale(${cardScale})`, borderRadius: 22, overflow: 'hidden', boxShadow: '0 50px 110px rgba(0,0,0,0.5)', border: '6px solid rgba(255,255,255,0.06)' }}>
          <Img src={staticFile('shots/card.png')} style={{ width: 420, display: 'block' }} />
        </div>
        {/* live count-up callout */}
        <Reveal delay={16} dur={16}>
          <div style={{ textAlign: 'left' }}>
            <div style={{ color: C.tealLight, fontSize: 30, fontWeight: 600 }}>Splitting between 14</div>
            <div style={{ position: 'relative', display: 'inline-block', marginTop: 8 }}>
              <div style={{ fontFamily: display, fontSize: 150, fontWeight: 800, color: C.cream, letterSpacing: '-0.03em', lineHeight: 1 }}>{money(per)}</div>
              <div style={{ position: 'absolute', inset: -22, borderRadius: 28, border: `3px solid ${C.gold}`, transform: `scale(${ringPulse})`, opacity: 0.55 }} />
            </div>
            <div style={{ color: C.cream, fontSize: 34, fontWeight: 700, marginTop: 6 }}>per person<span style={{ color: C.tealLight, fontWeight: 500 }}>, all in</span></div>
          </div>
        </Reveal>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 4 — Vote → shortlist (real card lifts) ─────────────────────────────────
const VoteScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const heart = spring({ frame: frame - 20, fps, config: { damping: 8, mass: 0.6, stiffness: 130 } });
  const heartScale = interpolate(heart, [0, 1], [0, 1]);
  const lift = spring({ frame: frame - 40, fps, config: { damping: 18 } });
  const cardY = interpolate(lift, [0, 1], [0, -70]);
  const pillO = interpolate(frame, [52, 66], [0, 1], clamp);
  const pillY = interpolate(frame, [52, 66], [20, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: C.cream, fontFamily: sans, justifyContent: 'center', alignItems: 'center' }}>
      <Reveal delay={2} dur={16} style={{ position: 'absolute', top: 70, left: 0, right: 0, textAlign: 'center' }}>{eyebrow('Vote in the open', C.teal2)}</Reveal>
      {/* shortlist pill target */}
      <div style={{ position: 'absolute', top: 200, opacity: pillO, transform: `translateY(${pillY}px)`, display: 'flex', alignItems: 'center', gap: 12, background: '#e7f1ec', color: C.green, border: `1px solid #bfe0d2`, borderRadius: 999, padding: '14px 26px', fontSize: 30, fontWeight: 800, boxShadow: '0 20px 50px rgba(19,40,30,0.18)' }}>
        <span>♥ Shortlist</span><span style={{ background: C.green, color: '#fff', borderRadius: 999, padding: '2px 14px' }}>+1</span>
      </div>
      <div style={{ position: 'relative', transform: `translateY(${cardY}px)`, borderRadius: 22, overflow: 'hidden', boxShadow: '0 50px 110px rgba(19,40,30,0.28)', border: `1px solid ${C.border}` }}>
        <Img src={staticFile('shots/card.png')} style={{ width: 420, display: 'block' }} />
        {/* heart pop overlay */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ transform: `scale(${heartScale})`, fontSize: 150, color: '#e5484d', filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.3))' }}>♥</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 5 — Scout (real detail modal) ──────────────────────────────────────────
const ScoutScene: React.FC = () => {
  const frame = useCurrentFrame();
  const glow = 0.4 + 0.25 * Math.sin(frame / 8);
  return (
    <AbsoluteFill style={{ background: C.teal, fontFamily: sans }}>
      <Reveal delay={4} dur={16} style={{ position: 'absolute', top: 52, left: 0, right: 0, textAlign: 'center' }}>{eyebrow('Meet Scout, your AI guide')}</Reveal>
      <ScreenFrame src="shots/detail.png" from={1.04} to={1.12} focusX={70} focusY={30} width={1500} top={104} />
      {/* soft highlight over the "why Scout ranks it here" region */}
      <div style={{ position: 'absolute', top: 300, left: '50%', transform: 'translateX(170px)', width: 560, height: 120, borderRadius: 18, boxShadow: `0 0 0 3px rgba(230,188,84,${glow})`, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};

// ── Scene 6 — Lock the official pick (gold seal motion graphic) ──────────────────
const LockScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stamp = spring({ frame: frame - 16, fps, config: { damping: 9, mass: 0.8, stiffness: 120 } });
  const sc = interpolate(stamp, [0, 1], [2.6, 1]);
  const o = interpolate(frame, [10, 20], [0, 1], clamp);
  const ring = interpolate(frame, [28, 62], [0, 1], clamp);
  const ringO = interpolate(frame, [28, 62], [0.55, 0], clamp);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 30%, #1a5f59, ${C.teal} 70%)`, fontFamily: sans, justifyContent: 'center', alignItems: 'center' }}>
      <Reveal delay={2} dur={16} style={{ position: 'absolute', top: 150, left: 0, right: 0, textAlign: 'center' }}>{eyebrow('The decision', C.gold)}</Reveal>
      <div style={{ position: 'relative', width: 260, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 30 }}>
        <div style={{ position: 'absolute', width: 260, height: 260, borderRadius: 999, border: `4px solid ${C.gold}`, transform: `scale(${1 + ring * 1.4})`, opacity: ringO }} />
        <div style={{ width: 210, height: 210, borderRadius: 999, background: `linear-gradient(160deg, #f0cf78, ${C.gold})`, opacity: o, transform: `scale(${sc})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 26px 60px rgba(0,0,0,0.4)' }}>
          <svg width={100} height={100} viewBox="0 0 56 56"><path d="M14 31 L28 17 L42 31" fill="none" stroke="#134E4A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><path d="M18 29 V41 H38 V29" fill="none" stroke="#134E4A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><circle cx="28" cy="35" r="3.6" fill="#134E4A" /></svg>
        </div>
      </div>
      <Reveal delay={42} dur={16} style={{ marginTop: 40, textAlign: 'center' }}>
        <div style={{ color: C.cream, fontFamily: display, fontSize: 38, fontWeight: 800 }}>It's official.</div>
      </Reveal>
    </AbsoluteFill>
  );
};

// ── Scene 7 — End card ────────────────────────────────────────────────────────────
const EndScene: React.FC = () => (
  <AbsoluteFill style={{ background: C.cream, fontFamily: sans, justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
    <Reveal delay={2} dur={18}><Mark size={120} /></Reveal>
    <Reveal delay={10} dur={20} style={{ marginTop: 30 }}>
      <div style={{ fontFamily: display, fontSize: 84, fontWeight: 800, color: C.teal, letterSpacing: '-0.025em', lineHeight: 1.06, maxWidth: 1300 }}>
        Get your group to <span style={{ fontStyle: 'italic' }}>actually agree.</span>
      </div>
    </Reveal>
    <Reveal delay={24} dur={16} style={{ marginTop: 30 }}>
      <div style={{ display: 'inline-block', background: C.teal, color: C.cream, fontWeight: 700, fontSize: 32, padding: '18px 44px', borderRadius: 16 }}>GroupPad · free in your browser</div>
    </Reveal>
  </AbsoluteFill>
);

// ── Compose ─────────────────────────────────────────────────────────────────────
const TRANSITION = 14; // frames each cross-fade/slide overlaps
const trans = () => linearTiming({ durationInFrames: TRANSITION });

// A scene wrapped with its narrative caption (skip caption on the end card).
const withCaption = (id: string, node: React.ReactNode, accent?: string, noCaption?: boolean) => (
  <AbsoluteFill>
    {node}
    {!noCaption && <Caption text={sceneById(id).text} sceneFramesLen={framesOf(id)} accent={accent} />}
  </AbsoluteFill>
);

export const Demo: React.FC = () => (
  <AbsoluteFill style={{ background: C.teal }}>
    <Audio loop src={staticFile('bed.wav')} volume={(f) => interpolate(f, [0, FPS, DEMO_DURATION - 45, DEMO_DURATION], [0, 0.32, 0.32, 0], clamp)} />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={framesOf('intro')}>{withCaption('intro', <Hook />)}</TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={trans()} />
      <TransitionSeries.Sequence durationInFrames={framesOf('board')}>{withCaption('board', <BoardScene />)}</TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={trans()} />
      <TransitionSeries.Sequence durationInFrames={framesOf('perPerson')}>{withCaption('perPerson', <PerPersonScene />)}</TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={trans()} />
      <TransitionSeries.Sequence durationInFrames={framesOf('vote')}>{withCaption('vote', <VoteScene />, C.green)}</TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={trans()} />
      <TransitionSeries.Sequence durationInFrames={framesOf('scout')}>{withCaption('scout', <ScoutScene />)}</TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={trans()} />
      <TransitionSeries.Sequence durationInFrames={framesOf('lock')}>{withCaption('lock', <LockScene />, C.gold)}</TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={trans()} />
      <TransitionSeries.Sequence durationInFrames={framesOf('end')}>{withCaption('end', <EndScene />, undefined, true)}</TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);

// 6 transitions overlap, each removing TRANSITION frames from the timeline total.
export const DEMO_DURATION = SCENES.reduce((n, s) => n + sceneFrames(s), 0) - 6 * TRANSITION;

import React from 'react';
import {
  AbsoluteFill, Series, Audio, Img, staticFile, useCurrentFrame, useVideoConfig,
  interpolate, spring, Easing, random,
} from 'remotion';
import { C, display, sans, Mark } from './theme';

const ease = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// Fade + lift a child in over `dur` frames starting at `delay`.
const Reveal: React.FC<{ delay?: number; dur?: number; y?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ delay = 0, dur = 18, y = 28, children, style }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [delay, delay + dur], [0, 1], ease);
  const ty = interpolate(frame, [delay, delay + dur], [y, 0], { ...ease, easing: Easing.out(Easing.cubic) });
  return <div style={{ opacity: o, transform: `translateY(${ty}px)`, ...style }}>{children}</div>;
};

// ── Scene 1 — Hook ────────────────────────────────────────────────────────────
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const bubbles = new Array(11).fill(0).map((_, i) => i);
  return (
    <AbsoluteFill style={{ background: C.teal, fontFamily: sans, overflow: 'hidden' }}>
      {bubbles.map((i) => {
        const seed = `b${i}`;
        const x = 180 + random(seed + 'x') * 1560;
        const startF = 6 + i * 4;
        const rise = interpolate(frame, [startF, startF + 40], [1180, 120 + random(seed + 'y') * 620], { ...ease, easing: Easing.out(Easing.cubic) });
        const o = interpolate(frame, [startF, startF + 14, 64, 78], [0, 0.9, 0.9, 0], ease);
        const w = 120 + random(seed + 'w') * 150;
        const rot = (random(seed + 'r') - 0.5) * 16;
        const gold = i % 5 === 0;
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: rise, width: w, height: 44, borderRadius: 22, background: gold ? C.gold : 'rgba(236,243,241,0.16)', border: `1px solid rgba(236,243,241,${gold ? 0 : 0.25})`, opacity: o, transform: `rotate(${rot}deg)` }} />
        );
      })}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <Reveal delay={22} dur={20}>
          <div style={{ fontFamily: display, fontSize: 86, fontWeight: 800, color: C.cream, letterSpacing: '-0.02em', lineHeight: 1.08 }}>
            Planning a trip with friends?
          </div>
        </Reveal>
        <Reveal delay={40} dur={18}>
          <div style={{ fontSize: 38, color: C.tealLight, marginTop: 22 }}>It always dies in the group chat.</div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── Scene 2 — One board (real screenshot) ─────────────────────────────────────
const Board: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame: frame - 6, fps, config: { damping: 200, mass: 1 } });
  const ty = interpolate(rise, [0, 1], [420, 0]);
  const sc = interpolate(rise, [0, 1], [0.96, 1]);
  return (
    <AbsoluteFill style={{ background: C.cream, fontFamily: sans, justifyContent: 'flex-start', alignItems: 'center' }}>
      <Reveal delay={4} dur={16} style={{ marginTop: 70, textAlign: 'center' }}>
        <div style={{ color: C.teal2, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 22 }}>One shared board</div>
        <div style={{ fontFamily: display, fontSize: 64, fontWeight: 800, color: C.teal, letterSpacing: '-0.02em', marginTop: 8 }}>Every home, in one place.</div>
      </Reveal>
      <div style={{ marginTop: 46, transform: `translateY(${ty}px) scale(${sc})`, width: 1320, borderRadius: 18, overflow: 'hidden', border: `1px solid ${C.border}`, boxShadow: '0 50px 120px rgba(19,40,30,0.35)' }}>
        {/* browser chrome */}
        <div style={{ height: 40, background: '#0e1714', display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 16 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />)}
        </div>
        <Img src={staticFile('board.png')} style={{ width: '100%', display: 'block' }} />
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 3 — Per-person price (signature beat) ───────────────────────────────
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const PerPerson: React.FC = () => {
  const frame = useCurrentFrame();
  const total = 5022;
  // split ticks 14 -> 10 between frames 70 and 95
  const split = Math.round(interpolate(frame, [70, 95], [14, 10], ease));
  const per = total / split;
  // count the per-person up on entry
  const counted = interpolate(frame, [22, 50], [0, per], { ...ease, easing: Easing.out(Easing.cubic) });
  const shown = frame < 70 ? counted : per;
  return (
    <AbsoluteFill style={{ background: C.cream, fontFamily: sans, justifyContent: 'center', alignItems: 'center' }}>
      <Reveal delay={2} dur={16} style={{ textAlign: 'center', position: 'absolute', top: 90 }}>
        <div style={{ fontFamily: display, fontSize: 58, fontWeight: 800, color: C.teal, letterSpacing: '-0.02em' }}>See what each person pays.</div>
      </Reveal>
      <Reveal delay={10} dur={18}>
        <div style={{ width: 760, background: C.card, borderRadius: 24, border: `1px solid ${C.border}`, boxShadow: '0 30px 70px rgba(19,40,30,0.18)', overflow: 'hidden' }}>
          <Img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80&auto=format&fit=crop" style={{ width: '100%', height: 320, objectFit: 'cover', display: 'block' }} />
          <div style={{ padding: '26px 30px' }}>
            <div style={{ fontFamily: display, fontSize: 30, fontWeight: 700, color: C.ink }}>L. Huge 7BR Pad · Downtown</div>
            <div style={{ color: C.muted, fontSize: 22, marginTop: 4 }}>Airbnb · sleeps 24 · 15 min to DTLA</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 22 }}>
              <div>
                <div style={{ fontFamily: display, fontSize: 44, fontWeight: 800, color: C.ink }}>{money(total)}</div>
                <div style={{ color: C.muted, fontSize: 20 }}>all-in · 5 nights</div>
              </div>
              <div style={{ background: '#e7f1ec', color: C.green, fontWeight: 800, fontSize: 30, padding: '12px 22px', borderRadius: 999 }}>
                {money(shown)} / person
              </div>
            </div>
          </div>
        </div>
      </Reveal>
      {/* split pill */}
      <Reveal delay={58} dur={14} style={{ position: 'absolute', bottom: 120 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: '12px 18px', fontSize: 26 }}>
          <span style={{ color: C.body, fontWeight: 600 }}>Splitting between</span>
          <span style={{ width: 40, height: 40, borderRadius: 999, background: C.chip, color: C.teal2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>−</span>
          <span style={{ fontFamily: display, fontWeight: 800, color: C.ink, minWidth: 40, textAlign: 'center' }}>{split}</span>
          <span style={{ width: 40, height: 40, borderRadius: 999, background: C.chip, color: C.teal2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>+</span>
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};

// ── Scene 4 — Scout's verdict ─────────────────────────────────────────────────
const Pill: React.FC<{ kind: 'best' | 'good'; children: React.ReactNode }> = ({ kind, children }) => (
  <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: 999, background: kind === 'best' ? '#e7f1ec' : C.chip, color: kind === 'best' ? C.green : C.teal2 }}>{children}</span>
);
const Scout: React.FC = () => {
  const ranked = [
    { n: 1, name: 'Huge 7BR Pad · Downtown', why: 'Cheapest per person and closest to your plans.', fit: 'best' as const },
    { n: 2, name: 'Spectacular mansion · views', why: 'Stunning, but 26 miles out adds drive time.', fit: 'good' as const },
  ];
  return (
    <AbsoluteFill style={{ background: C.cream, fontFamily: sans, justifyContent: 'center', alignItems: 'center' }}>
      <Reveal delay={2} dur={16} style={{ textAlign: 'center', position: 'absolute', top: 84 }}>
        <div style={{ color: C.teal2, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 22 }}>Meet Scout</div>
        <div style={{ fontFamily: display, fontSize: 58, fontWeight: 800, color: C.teal, letterSpacing: '-0.02em', marginTop: 6 }}>Stuck? Ask Scout.</div>
      </Reveal>
      <Reveal delay={12} dur={18}>
        <div style={{ width: 900, background: C.card, borderRadius: 24, border: `1px solid ${C.border}`, boxShadow: '0 30px 70px rgba(19,40,30,0.18)', padding: 30 }}>
          <Reveal delay={20} dur={16}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#eef6f2', border: `1px solid #cfe6dd`, borderRadius: 16, padding: '16px 20px' }}>
              <div style={{ width: 44, height: 44, borderRadius: 999, background: C.teal, color: C.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>★</div>
              <div>
                <div style={{ fontFamily: display, fontSize: 26, fontWeight: 800, color: C.ink }}>Huge 7BR Pad · Downtown</div>
                <div style={{ color: C.body, fontSize: 19 }}>Best fit for 14: sleeps everyone, lowest per head, 15 min to your plans.</div>
              </div>
            </div>
          </Reveal>
          {ranked.map((r, i) => (
            <Reveal key={r.n} delay={34 + i * 12} dur={14} style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${r.fit === 'best' ? C.green : C.teal2}`, borderRadius: 12, padding: '14px 16px' }}>
                <span style={{ width: 30, height: 30, borderRadius: 999, background: C.chip, color: C.body, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{r.n}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 700, color: C.ink, fontSize: 21 }}>{r.name}</span>
                    <Pill kind={r.fit}>{r.fit === 'best' ? 'Best fit' : 'Worth it'}</Pill>
                  </div>
                  <div style={{ color: C.body, fontSize: 18, marginTop: 2 }}>{r.why}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Reveal>
    </AbsoluteFill>
  );
};

// ── Scene 5 — Lock the pick ───────────────────────────────────────────────────
const Lock: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stamp = spring({ frame: frame - 18, fps, config: { damping: 9, mass: 0.8, stiffness: 120 } });
  const sc = interpolate(stamp, [0, 1], [2.4, 1]);
  const o = interpolate(frame, [12, 22], [0, 1], ease);
  const ring = interpolate(frame, [30, 60], [0, 1], ease);
  const ringO = interpolate(frame, [30, 60], [0.5, 0], ease);
  return (
    <AbsoluteFill style={{ background: C.teal, fontFamily: sans, justifyContent: 'center', alignItems: 'center' }}>
      <Reveal delay={2} dur={16} style={{ position: 'absolute', top: 120, textAlign: 'center' }}>
        <div style={{ color: C.gold, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', fontSize: 22 }}>The decision</div>
        <div style={{ fontFamily: display, fontSize: 60, fontWeight: 800, color: C.cream, letterSpacing: '-0.02em', marginTop: 6 }}>Lock the official pick.</div>
      </Reveal>
      <div style={{ position: 'relative', width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', width: 220, height: 220, borderRadius: 999, border: `4px solid ${C.gold}`, transform: `scale(${1 + ring * 1.3})`, opacity: ringO }} />
        <div style={{ width: 180, height: 180, borderRadius: 999, background: C.gold, opacity: o, transform: `scale(${sc})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.35)' }}>
          <svg width={84} height={84} viewBox="0 0 56 56"><path d="M14 31 L28 17 L42 31" fill="none" stroke="#134E4A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><path d="M18 29 V41 H38 V29" fill="none" stroke="#134E4A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      </div>
      <Reveal delay={40} dur={16} style={{ marginTop: 34, textAlign: 'center' }}>
        <div style={{ color: C.cream, fontFamily: display, fontSize: 30, fontWeight: 700 }}>It's official. The group has a winner.</div>
      </Reveal>
    </AbsoluteFill>
  );
};

// ── Scene 6 — End card ────────────────────────────────────────────────────────
const End: React.FC = () => (
  <AbsoluteFill style={{ background: C.cream, fontFamily: sans, justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
    <Reveal delay={2} dur={18}><Mark size={104} /></Reveal>
    <Reveal delay={10} dur={20} style={{ marginTop: 28 }}>
      <div style={{ fontFamily: display, fontSize: 72, fontWeight: 800, color: C.teal, letterSpacing: '-0.02em', lineHeight: 1.08, maxWidth: 1200 }}>
        Get your group to <span style={{ fontStyle: 'italic' }}>actually agree</span> on where to stay.
      </div>
    </Reveal>
    <Reveal delay={22} dur={16} style={{ marginTop: 22 }}>
      <div style={{ fontSize: 32, color: C.muted }}>One board. Everyone votes. Done.</div>
    </Reveal>
    <Reveal delay={32} dur={16} style={{ marginTop: 34 }}>
      <div style={{ display: 'inline-block', background: C.teal, color: C.cream, fontWeight: 700, fontSize: 28, padding: '16px 40px', borderRadius: 14 }}>GroupPad · free in your browser</div>
    </Reveal>
  </AbsoluteFill>
);

export const Demo: React.FC = () => (
  <AbsoluteFill>
    <Audio loop src={staticFile('bed.wav')} volume={(f) => interpolate(f, [0, 18, 770, 800], [0, 0.5, 0.5, 0], ease)} />
    <Series>
      <Series.Sequence durationInFrames={90}><Hook /></Series.Sequence>
      <Series.Sequence durationInFrames={150}><Board /></Series.Sequence>
      <Series.Sequence durationInFrames={180}><PerPerson /></Series.Sequence>
      <Series.Sequence durationInFrames={150}><Scout /></Series.Sequence>
      <Series.Sequence durationInFrames={120}><Lock /></Series.Sequence>
      <Series.Sequence durationInFrames={110}><End /></Series.Sequence>
    </Series>
  </AbsoluteFill>
);

export const DEMO_DURATION = 90 + 150 + 180 + 150 + 120 + 110; // 800 frames

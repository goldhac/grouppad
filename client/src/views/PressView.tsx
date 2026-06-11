import { Link } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';

const FACTS: [string, string][] = [
  ['What it is', 'A shared board where groups browse vacation rentals, vote, see per-person cost, compare with AI, and lock one pick together.'],
  ['Who it is for', 'Anyone organizing a trip for a group: milestone birthdays, bachelor and bachelorette parties, family reunions, friend getaways, team retreats.'],
  ['Why it exists', 'Group trips do not fail at finding places. They fail at agreeing on one. GroupPad is built for the deciding, not the browsing.'],
  ['What is different', 'Per-person pricing on every home. Scout, an AI that gives a real verdict instead of a wall of text. One official pick the organizer locks so the debate ends. Date flexibility and availability checks built in.'],
  ['Price', 'Free. Web-based, installable to the home screen, no download required.'],
];

const ASSETS: { file: string; label: string; sub: string }[] = [
  { file: 'hero-board-desktop.png', label: 'Board (desktop)', sub: 'The shared board with per-person pricing' },
  { file: 'board-mobile.png', label: 'Board (mobile)', sub: 'The mobile experience' },
  { file: 'social-calm-friends.png', label: 'Lifestyle', sub: 'Brand lifestyle image' },
  { file: 'social-chaos-groupchat.png', label: 'The problem', sub: 'The group chat that never decides' },
];

/** Press kit: boilerplate, fact sheet, and downloadable brand assets. */
export function PressView() {
  return (
    <main className="uu-main">
      <div className="tp-wrap uu-wrap" style={{ maxWidth: 860 }}>
        <Link className="uu-back" to="/"><Icon icon={ArrowLeft} className="ico" /> Back to GroupPad</Link>
        <div className="help-head" style={{ marginBottom: 18 }}>
          <div className="ey">Press kit</div>
          <h1>GroupPad, in one page</h1>
          <p>Everything you need to write about us. Quotes, facts, and downloadable assets.</p>
        </div>

        <article className="flex flex-col gap-8 text-[15px] leading-relaxed text-text-2">
          <section className="flex flex-col gap-2.5">
            <h2 className="font-display text-[19px] font-semibold text-text">The one-liner</h2>
            <p className="text-[17px] text-text">GroupPad gets your group to actually agree on where to stay.</p>
            <p>Planning a trip with friends turns into a mess of links and half-answered texts. GroupPad puts every rental on one shared board so everyone can vote, see what they would pay, and settle on a place without the 200-message thread.</p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-[19px] font-semibold text-text">Fact sheet</h2>
            <div className="flex flex-col gap-2">
              {FACTS.map(([k, v]) => (
                <div key={k} style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '13px 16px' }}>
                  <div className="font-semibold text-text" style={{ fontSize: 13.5 }}>{k}</div>
                  <div style={{ marginTop: 3 }}>{v}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="font-display text-[19px] font-semibold text-text">A quote you can use</h2>
            <blockquote style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 16, fontSize: 17, color: 'var(--text)', fontStyle: 'italic' }}>
              "Airbnb won browsing. Nobody won deciding. That is the whole gap GroupPad fills."
            </blockquote>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-display text-[19px] font-semibold text-text">Assets</h2>
            <p>Right-click any image to save it, or use the download buttons. Please do not alter the logo or recolor screenshots.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
              {ASSETS.map((a) => (
                <div key={a.file} style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
                  <img src={`/press/${a.file}`} alt={a.label} loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="font-semibold text-text" style={{ fontSize: 13.5 }}>{a.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{a.sub}</div>
                    </div>
                    <a className="btn btn-ghost btn-sm btn-icon" href={`/press/${a.file}`} download aria-label={`Download ${a.label}`}>
                      <Icon icon={Download} className="ico" />
                    </a>
                  </div>
                </div>
              ))}
              <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
                <img src="/og.jpg" alt="GroupPad brand card" loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="font-semibold text-text" style={{ fontSize: 13.5 }}>Brand card</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>The GroupPad illustration</div>
                  </div>
                  <a className="btn btn-ghost btn-sm btn-icon" href="/og.jpg" download aria-label="Download brand card"><Icon icon={Download} className="ico" /></a>
                </div>
              </div>
              <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
                <div style={{ width: '100%', aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', background: 'var(--surface-sunken)' }}>
                  <img src="/icon-512.png" alt="GroupPad app icon" loading="lazy" style={{ width: 96, height: 96, borderRadius: 22 }} />
                </div>
                <div style={{ padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="font-semibold text-text" style={{ fontSize: 13.5 }}>App icon</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>512px PNG</div>
                  </div>
                  <a className="btn btn-ghost btn-sm btn-icon" href="/icon-512.png" download aria-label="Download app icon"><Icon icon={Download} className="ico" /></a>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-2.5">
            <h2 className="font-display text-[19px] font-semibold text-text">Contact</h2>
            <p>Press and partnerships: <a className="text-link hover:underline" href="mailto:akporkofi11@gmail.com">akporkofi11@gmail.com</a>. We reply fast.</p>
          </section>
        </article>
      </div>
    </main>
  );
}

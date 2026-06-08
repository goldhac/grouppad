import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Moon, Sun, LayoutGrid, ThumbsUp, Sparkles, Lock, Users, Swords, Clapperboard } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { useApp } from '@/store/AppContext';

const IMG = (id: string, w = 1000) => `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;
const BrandMark = ({ s }: { s: number }) => (
  <svg className="mk" width={s} height={s} viewBox="0 0 56 56"><rect width="56" height="56" rx="16" fill="var(--accent)" /><path d="M14 31 L28 17 L42 31" fill="none" stroke="var(--accent-fg)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M18 29 V41 H38 V29" fill="none" stroke="var(--accent-fg)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /><circle cx="28" cy="35" r="3.4" fill="var(--gold-dot)" /></svg>
);

const LOOP = [
  { icon: LayoutGrid, h: 'Browse together', p: "Everyone adds the rentals they're eyeing to one shared board — curated, scraped, or pasted from any link." },
  { icon: ThumbsUp, h: 'Vote, see the real cost', p: 'A thumb up floats a home to the shortlist. Every price shows the all-in total and the per-person split, live.' },
  { icon: Sparkles, h: 'Let Scout break the tie', p: 'Run a 1v1 or compare the shortlist — Scout weighs price, distance, and your plans, and explains the call.' },
  { icon: Lock, h: 'Lock the official pick', p: 'Everyone casts one top choice. The organizer seals the winner with a gold lock — debate over.' },
];
const PAIRS = [
  { tag: 'Per person', icon: Users, title: 'Every home, priced per head.', body: 'No more mental math in the group chat. GroupPad shows the all-in total and what each person actually pays — recomputed live as your group size changes.', img: '1600566753086-00f18fb6b3ea', float: true },
  { tag: 'Meet Scout', icon: Swords, title: 'Let Scout settle the tie.', body: 'Stuck between two? Run a head-to-head and Scout weighs price, distance, and your itinerary — then tells you which wins and why, in plain language.', img: '1600585152220-90363fe7e115', float: false },
  { tag: 'Walkthrough', icon: Clapperboard, title: 'A tour of the best rooms — generated for you.', body: "The board picks each home's standout spaces and stitches a short walkthrough, so the group feels the place before anyone books a flight.", img: '1600047509807-ba8f99d2cdde', float: false },
];

export function MobileLanding() {
  const navigate = useNavigate();
  const { openAuth, user } = useApp();
  const scrollRef = useRef<HTMLDivElement>(null);
  const howRef = useRef<HTMLElement>(null);
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('gp_theme', next); } catch { /* ignore */ }
    setTheme(next);
  };
  const start = () => { if (user) navigate('/trips'); else openAuth('start a trip'); };
  const seeHow = () => { if (howRef.current && scrollRef.current) scrollRef.current.scrollTo({ top: howRef.current.offsetTop - 60, behavior: 'smooth' }); };

  return (
    <div className="gp-mobile">
      <div className="mb">
        <div className="ln-nav"><div className="row">
          <span className="brand"><BrandMark s={28} /> GroupPad</span><span className="spacer" />
          <button className="iconbtn" onClick={toggleTheme} aria-label="Theme"><Icon icon={theme === 'dark' ? Sun : Moon} className="ico" /></button>
          <button className="btn btn-primary btn-sm" onClick={start}><Icon icon={Plus} className="ico" /> Start</button>
        </div></div>

        <div className="ln-scroll" ref={scrollRef}>
          <section className="ln-hero">
            <span className="ln-kicker"><span className="gd" /> Skip the endless group chat</span>
            <h1>Pick the place your whole group <em>actually agrees</em> on.</h1>
            <p>GroupPad turns "where should we stay?" into one shared board — add rentals, vote, see the real per-person cost, ask Scout, and lock the winner together.</p>
            <div className="ln-cta">
              <button className="btn btn-primary" onClick={start}><Icon icon={Plus} className="ico" /> Get started — it's free</button>
              <button className="btn btn-ghost" onClick={seeHow}>See how it works</button>
            </div>
            <div className="ln-band">
              <img src={IMG('1600585154340-be6161a56a0c')} alt="" />
              <div className="scrim" />
              <div className="cap"><div className="t">Huge 7BR Pad · Downtown</div><div className="s">Sleeps 24 · pool · 15 min to DTLA</div></div>
              <div className="pricepill tnum">$5,022 all-in <span className="pp">· $359 / person</span></div>
            </div>
          </section>

          <section className="ln-sec" ref={howRef as React.RefObject<HTMLElement>}>
            <div className="ln-chapno">01 — The core loop</div>
            <h2 className="ln-h2">From scattered links to one locked pick.</h2>
            <span className="ln-try"><Icon icon={Sparkles} className="ico" /> The whole flow in four steps</span>
            <div className="ln-loop">
              {LOOP.map((l, i) => (
                <div className="ln-loopitem" key={i}><span className="ix"><Icon icon={l.icon} className="ico" /></span><div><h4>{l.h}</h4><p>{l.p}</p></div></div>
              ))}
            </div>
            <div className="ln-preview"><img src={IMG('1600607687939-ce8a6c25118c', 900)} alt="" /><div className="pv-cap"><Icon icon={LayoutGrid} className="ico" /> One board · everyone votes · per-person pricing on every card</div></div>
          </section>

          {PAIRS.map((p, i) => (
            <section className="ln-pair" key={i}>
              <div className="media"><img src={IMG(p.img)} alt="" />{p.float && <div className="float"><div className="lbl">Per person</div><div className="v tnum">$359</div></div>}</div>
              <span className="tag"><Icon icon={p.icon} className="ico" /> {p.tag}</span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </section>
          ))}

          <section className="ln-ctaband">
            <img src={IMG('1564013799919-ab600027ffc6')} alt="" /><div className="scrim" />
            <div className="c">
              <span className="k"><span className="gd" /> Ready when you are</span>
              <h2>Your group's next trip starts with one board.</h2>
              <p>Spin one up in under a minute, share the link, and let everyone weigh in.</p>
              <button className="btn btn-onphoto" onClick={start}><Icon icon={Plus} className="ico" /> Create your first trip</button>
            </div>
          </section>

          <footer className="ln-foot">
            <span className="brand"><BrandMark s={24} /> GroupPad</span>
            <p className="tag">The calm way for groups to pick one rental — browse, vote, compare with Scout, and lock the winner without the endless group chat.</p>
            <div className="links"><a onClick={start}>Start a trip</a><a onClick={seeHow}>How it works</a><a onClick={() => navigate('/terms')}>Terms</a><a onClick={() => navigate('/privacy')}>Privacy</a></div>
            <div className="copy">© 2026 GroupPad · Prices are estimates — verify all-in totals at the booking step. Made for group trips.</div>
          </footer>
        </div>

        <div className="ln-bottomcta"><button className="btn btn-primary" onClick={start}><Icon icon={Plus} className="ico" /> Get started</button><span className="mini">Free · share a link in under a minute</span></div>
      </div>
    </div>
  );
}

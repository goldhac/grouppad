import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Moon, Sun, LayoutGrid, ThumbsUp, Sparkles, Lock, Users, Swords, Clapperboard } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { SignatureIcon } from '@/components/ui/SignatureIcon';
import { useApp } from '@/store/AppContext';

const IMG = (id: string, w = 1000) => `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;
const BrandMark = ({ s }: { s: number }) => (
  <svg className="mk" width={s} height={s} viewBox="0 0 56 56"><rect width="56" height="56" rx="16" fill="var(--accent)" /><path d="M14 31 L28 17 L42 31" fill="none" stroke="var(--accent-fg)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M18 29 V41 H38 V29" fill="none" stroke="var(--accent-fg)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /><circle cx="28" cy="35" r="3.4" fill="var(--gold-dot)" /></svg>
);

const LOOP = [
  { icon: LayoutGrid, h: 'Get every option in one place', p: 'Drop in any rental link, or browse the homes we already pulled together. No more ten tabs and a lost group chat.' },
  { icon: ThumbsUp, h: 'Vote, and see what it really costs', p: 'Thumbs up the ones you like. Each home shows the all-in total and what that works out to per person, updated as people join.' },
  { icon: 'scout' as const, h: 'Ask Scout when you cannot decide', p: 'Put two homes head to head, or hand Scout the whole shortlist. It weighs price, distance, and your plans, then makes the call.' },
  { icon: Lock, h: 'Lock it in', p: 'Everyone picks their favorite. Whoever set up the trip makes it official, and the back-and-forth is done.' },
];
const PAIRS = [
  { tag: 'Per person', icon: Users, title: "See what you'd actually pay.", body: "Nobody wants to do the math at 1am. Every home shows the all-in total and your share of it, and both update the moment someone joins or drops out.", img: '1600566753086-00f18fb6b3ea', float: true },
  { tag: 'Meet Scout', icon: Swords, title: 'Torn between two? Ask Scout.', body: 'Put two homes side by side and Scout weighs the price, the drive, and what your group has planned, then makes the call and shows its reasoning.', img: '1600585152220-90363fe7e115', float: false },
  { tag: 'Walkthrough', icon: Clapperboard, title: 'Walk through a place before you commit.', body: "For each home, GroupPad pulls the best rooms into a short video tour, so the group gets a real feel for it before anyone spends a dollar on flights.", img: '1600047509807-ba8f99d2cdde', float: false },
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
            <span className="ln-kicker"><span className="gd" /> For groups who can never agree on a place</span>
            <h1>Get your group to <em>actually agree</em> on where to stay.</h1>
            <p>Planning with friends turns into a mess of links and half-answered texts. GroupPad puts every rental on one board so everyone can vote, see what they'd pay, and settle on a place.</p>
            <div className="ln-cta">
              <button className="btn btn-primary" onClick={start}><Icon icon={Plus} className="ico" /> Start free</button>
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
            <div className="ln-chapno">01 · How it works</div>
            <h2 className="ln-h2">Four steps from "no idea" to booked.</h2>
            <span className="ln-try"><Icon icon={Sparkles} className="ico" /> The whole flow in four steps</span>
            <div className="ln-loop">
              {LOOP.map((l, i) => (
                <div className="ln-loopitem" key={i}><span className="ix">{l.icon === 'scout' ? <SignatureIcon name="scout" className="ico" /> : <Icon icon={l.icon} className="ico" />}</span><div><h4>{l.h}</h4><p>{l.p}</p></div></div>
              ))}
            </div>
            <div className="ln-preview"><img src={IMG('1600607687939-ce8a6c25118c', 900)} alt="" /><div className="pv-cap"><Icon icon={LayoutGrid} className="ico" /> One board, everyone votes, per-person pricing on every card</div></div>
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
              <h2>Start the board. Send the link. Let them argue it out.</h2>
              <p>Setting up a trip takes about a minute. Share the link and your group can jump in from anywhere.</p>
              <button className="btn btn-onphoto" onClick={start}><Icon icon={Plus} className="ico" /> Create your first trip</button>
            </div>
          </section>

          <footer className="ln-foot">
            <span className="brand"><BrandMark s={24} /> GroupPad</span>
            <p className="tag">The calmer way for a group to pick one rental. Browse, vote, compare with Scout, and lock the winner without the 200-message thread.</p>
            <div className="links"><a onClick={start}>Start a trip</a><a onClick={seeHow}>How it works</a><a onClick={() => navigate('/terms')}>Terms</a><a onClick={() => navigate('/privacy')}>Privacy</a></div>
            <div className="copy">© 2026 GroupPad · Prices are estimates, so verify the all-in total at the booking step. Made for group trips.</div>
          </footer>
        </div>

        <div className="ln-bottomcta"><button className="btn btn-primary" onClick={start}><Icon icon={Plus} className="ico" /> Get started</button><span className="mini">Free · share a link in under a minute</span></div>
      </div>
    </div>
  );
}

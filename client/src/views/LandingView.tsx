import { useNavigate } from 'react-router-dom';
import { Plus, Sparkles, Users, Swords, Clapperboard, ArrowRight, LayoutGrid, ThumbsUp, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { useIsMobile } from '@/lib/useIsMobile';
import { MobileLanding } from '@/views/MobileLanding';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ScoutMark } from '@/components/ui/ScoutMark';
import { SafeImg } from '@/components/ui/SafeImg';
import { CoreLoopDemo } from '@/views/landing/CoreLoopDemo';
import { MoneyCount } from '@/components/ui/MoneyCount';
import { useScrollReveal } from '@/lib/useScrollReveal';

const IMG = (id: string) => `https://images.unsplash.com/photo-${id}?w=1100&q=80&auto=format&fit=crop`;

const LOOP = [
  { icon: <Icon icon={LayoutGrid} className="ico" />, h: 'Get every option in one place', p: 'Drop in any rental link, or browse the homes we already pulled together. No more ten tabs and a lost group chat.' },
  { icon: <Icon icon={ThumbsUp} className="ico" />, h: 'Vote, and see what it really costs', p: 'Thumbs up the ones you like. Each home shows the all-in total and what that works out to per person, updated as people join.' },
  { icon: <ScoutMark className="ico" />, h: 'Ask Scout when you cannot decide', p: 'Put two homes head to head, or hand Scout the whole shortlist. It looks at price, distance, and your plans, then tells you which one it would book and why.' },
  { icon: <Icon icon={Lock} className="ico" />, h: 'Lock it in', p: 'Everyone picks their favorite. Whoever set up the trip makes it official, and the back-and-forth is done.' },
];

export function LandingView() {
  const { user, openAuth, startOnboarding } = useApp();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  useScrollReveal();

  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const primary = () => {
    if (user) navigate('/trips/new');
    else window.location.href = api.googleSignInUrl;
  };
  const seeHow = () => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (isMobile) return <MobileLanding />;

  return (
    <div className="d1">
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="d1-hero wrap">
        <span className="d1-kicker rv">
          <span className="golddot-motif" /> For groups who can never agree on a place
        </span>
        <h1 className="rv d1">
          Get your group to <em>actually agree</em> on where to stay.
        </h1>
        <div className="d1-hero-sub">
          <p className="rv d2">
            Planning a trip with friends turns into a mess of links and half-answered texts. GroupPad
            puts every rental on one board so everyone can vote, see what they'd pay, and settle on a place
            without the 200-message thread.
          </p>
          <div className="cta rv d3">
            <Button variant="primary" size="lg" onClick={primary}>
              <Plus className="h-[18px] w-[18px]" /> {user ? 'Start a trip' : 'Start free'}
            </Button>
            <Button variant="ghost" size="lg" onClick={seeHow}>See how it works</Button>
          </div>
        </div>

        {/* full-bleed media band — ambient AI-generated tour (poster fallback) */}
        <div className="d1-band rv d4">
          <video
            className="bg"
            poster="/landing-hero.jpg"
            autoPlay={!reduce}
            loop={!reduce}
            muted
            playsInline
            preload="metadata"
            aria-hidden
          >
            <source src="/landing-hero.mp4" type="video/mp4" />
          </video>
          <div className="frame-line" />
          <div className="scrim" />
          <div className="cap">
            <div className="t">Huge 7BR Pad · Downtown</div>
            <div className="s">Sleeps 24 · pool · 15 min to DTLA</div>
          </div>
          <div className="pricepill tnum">
            <MoneyCount value={5022} /> all-in <span className="pp">· <MoneyCount value={359} /> / person</span>
          </div>
        </div>
      </section>

      {/* ── 01 · THE CORE LOOP (live demo) ───────────────────────────────── */}
      <section id="how" className="d1-demo-band wrap">
        <div className="d1-demo-head">
          <div className="l">
            <div className="d1-chapno">01 · HOW IT WORKS</div>
            <h2 className="d1-h2 rv">Four steps from "no idea" to booked.</h2>
          </div>
          <span className="try rv"><Icon icon={Sparkles} className="ico" /> Live demo · click around</span>
        </div>
        <div className="d1-demoblock">
          <div className="d1-looplist rv">
            {LOOP.map((l) => (
              <div className="d1-loopitem" key={l.h}>
                <span className="ix">{l.icon}</span>
                <div>
                  <h4>{l.h}</h4>
                  <p>{l.p}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="rv d2">
            <CoreLoopDemo />
          </div>
        </div>
      </section>

      {/* ── FEATURE PAIRS ────────────────────────────────────────────────── */}
      <div className="wrap">
        <FeaturePair
          tag="Per person" tagIcon={Users}
          title="See what you'd actually pay."
          body="Nobody wants to do the math in their head at 1am. Every home shows the all-in total and your share of it, and both numbers update the moment someone joins or drops out."
          media={<SafeImg src={IMG('1600566753086-00f18fb6b3ea')} alt="A bright, spacious group rental interior" />}
          float={<div className="float pp"><div className="lbl">Per person</div><div className="v tnum"><MoneyCount value={359} /></div></div>}
        />
        <FeaturePair
          flip
          tag="Meet Scout" tagIcon={Swords}
          title="Torn between two? Ask Scout."
          body="Scout is the tie-breaker. Put two homes side by side and it weighs the price, the drive, and what your group actually has planned, then makes the call and tells you how it got there."
          media={<SafeImg src={IMG('1600585152220-90363fe7e115')} alt="A standout vacation home exterior" />}
        />
        <FeaturePair
          tag="Walkthrough" tagIcon={Clapperboard}
          title="Walk through a place before you commit."
          body="For each home, GroupPad pulls the best rooms into a short video tour. The group gets a real feel for the place before anyone spends a dollar on flights."
          media={
            <video poster="/landing-hero.jpg" autoPlay={!reduce} loop={!reduce} muted playsInline preload="metadata" aria-hidden
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}>
              <source src="/landing-tour.mp4" type="video/mp4" />
            </video>
          }
        />
      </div>

      {/* ── CTA BAND ─────────────────────────────────────────────────────── */}
      <section className="d1-cta wrap">
        <div className="d1-cta-inner rv">
          <SafeImg src={IMG('1564013799919-ab600027ffc6')} alt="" aria-hidden />
          <div className="scrim" />
          <div className="c">
            <span className="d1-cta-kicker"><span className="golddot-motif" /> Ready when you are</span>
            <h2>Start the board. Send the link. Let them argue it out.</h2>
            <p>Setting up a trip takes about a minute. Share the link and your group can jump in from anywhere.</p>
            <div className="cta">
              <button className="btn btn-lg btn-onphoto" onClick={primary}>
                <Plus className="h-[18px] w-[18px]" /> {user ? 'Start a trip' : 'Create your first trip'}
              </button>
              <button className="btn btn-lg btn-ghostphoto" onClick={() => (user ? seeHow() : openAuth())}>
                {user ? 'See how it works' : 'Sign in'}
              </button>
            </div>
            <button className="d1-cta-tertiary" onClick={() => startOnboarding(true)}>
              Prefer a 30-second guided tour? <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function FeaturePair({
  tag, tagIcon, title, body, media, float, flip = false,
}: {
  tag: string;
  tagIcon: typeof Users;
  title: string;
  body: string;
  media: React.ReactNode;
  float?: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <section className={`d1-pair${flip ? ' flip' : ''}`}>
      <div className="d1-pair-media rv">
        {media}
        <div className="frame-line" />
        {float}
      </div>
      <div className="d1-pair-text rv d2">
        <span className="tag"><Icon icon={tagIcon} className="ico" /> {tag}</span>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </section>
  );
}

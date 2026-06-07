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
  { icon: <Icon icon={LayoutGrid} className="ico" />, h: 'Browse together', p: 'Everyone adds the rentals they\'re eyeing to one shared board — curated, scraped, or pasted from any link.' },
  { icon: <Icon icon={ThumbsUp} className="ico" />, h: 'Vote, see the real cost', p: 'A thumb up floats a home to the shortlist. Every price shows the all-in total and the per-person split, live.' },
  { icon: <ScoutMark className="ico" />, h: 'Let Scout break the tie', p: 'Run a 1v1 or compare the shortlist — Scout weighs price, distance, and your plans, and explains the call.' },
  { icon: <Icon icon={Lock} className="ico" />, h: 'Lock the official pick', p: 'Everyone casts one top choice. The organizer seals the winner with a gold lock — debate over.' },
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
          <span className="golddot-motif" /> Group trips, minus the endless chat
        </span>
        <h1 className="rv d1">
          Pick the place your whole group <em>actually agrees</em> on.
        </h1>
        <div className="d1-hero-sub">
          <p className="rv d2">
            GroupPad turns "where should we stay?" into one shared board — add rentals, vote, see the
            real per-person cost, ask Scout, and lock the winner together.
          </p>
          <div className="cta rv d3">
            <Button variant="primary" size="lg" onClick={primary}>
              <Plus className="h-[18px] w-[18px]" /> {user ? 'Start a trip' : 'Get started — it\'s free'}
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
            <div className="d1-chapno">01 — THE CORE LOOP</div>
            <h2 className="d1-h2 rv">From scattered links to one locked pick.</h2>
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
          title="Every home, priced per head."
          body="No more mental math in the group chat. GroupPad shows the all-in total and what each person actually pays — recomputed live as your group size changes."
          media={<SafeImg src={IMG('1600566753086-00f18fb6b3ea')} alt="A bright, spacious group rental interior" />}
          float={<div className="float pp"><div className="lbl">Per person</div><div className="v tnum"><MoneyCount value={359} /></div></div>}
        />
        <FeaturePair
          flip
          tag="Meet Scout" tagIcon={Swords}
          title="Let Scout settle the tie."
          body="Stuck between two? Run a head-to-head and Scout weighs price, distance, and your itinerary — then tells you which wins and why, in plain language."
          media={<SafeImg src={IMG('1600585152220-90363fe7e115')} alt="A standout vacation home exterior" />}
        />
        <FeaturePair
          tag="Walkthrough" tagIcon={Clapperboard}
          title="A tour of the best rooms — generated for you."
          body="The board picks each home's standout spaces and stitches a short walkthrough, so the group feels the place before anyone books a flight."
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
            <h2>Your group's next trip starts with one board.</h2>
            <p>Spin one up in under a minute, share the link, and let everyone weigh in.</p>
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

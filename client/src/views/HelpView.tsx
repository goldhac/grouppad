import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, HelpCircle, ChevronDown, SlidersHorizontal, Bookmark, Map as MapIcon,
  Scale, Trophy, Users, MessagesSquare, UserPlus,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { useIsMobile } from '@/lib/useIsMobile';
import { MobileHelp } from '@/views/MobileHelp';
import { Icon } from '@/components/ui/Icon';

// Step-by-step walkthrough — each step pairs the warm illustration (the same art
// from the welcome tour) with what to actually do on screen.
const STEPS = [
  { img: '/onboarding/01-board.webp', step: 'The core loop', h: 'One board for the whole group', p: 'Every idea lands on one shared board instead of scattering across a 200-message group chat. Open the trip and you’re on the board.' },
  { img: '/onboarding/02-add.webp', step: 'Step 1 · Add homes', h: 'Paste any rental link', p: 'Tap Add (the + button) and paste an Airbnb, VRBO, Booking, or boutique-villa link. GroupPad scrapes the photos, beds, amenities and prices it all-in for your dates. No price on the page? Add one manually and it’s used as the estimate.' },
  { img: '/onboarding/06-scout.webp', step: 'Step 2 · Scout ranks', h: 'Recommended, ranked by AI', p: 'Scout reads your itinerary, budget and must-haves, then ranks every home (curated, live and community together) best-to-worst. The Recommended tab shows the top 10 within budget, each with a one-line “why it ranks here.”' },
  { img: '/onboarding/03-vote.webp', step: 'Step 3 · Vote', h: 'Vote in the open', p: 'Public thumbs, not secret hearts. Any home that reaches net +1 rises into the Group’s Shortlist on its own, so the front-runners surface themselves.' },
  { img: '/onboarding/04-perperson.webp', step: 'Step 4 · The number', h: 'The per-person cost', p: 'Every home shows the real all-in cost split across your group, the figure people actually argue about, recomputed live as people join. Use the Split slider to model a different headcount.' },
  { img: '/onboarding/05-lock.webp', step: 'Step 5 · Decide', h: 'Compare with Scout, then lock it', p: 'Down to a few? Ask Scout to compare them head-to-head. It weighs price, distance and your must-haves and calls a winner. The organizer makes one pick official for everyone with the gold lock.', gold: true },
];

// Every other feature, documented compactly.
const FEATURES = [
  { icon: SlidersHorizontal, h: 'Filters', p: 'Narrow by under-budget, pool, parking, hot tub, or a minimum “sleeps”. Filters stick per-trip: they survive refreshes and only reset when you sign out.' },
  { icon: Bookmark, h: 'Saved (private)', p: 'Bookmark homes to your own Saved list that only you see. Ask Scout to rank just your saved picks for you; it never touches the group’s board.' },
  { icon: MapIcon, h: 'Map & distances', p: 'Open any home for a map and drive-time chips to the spots that matter (airport, downtown, the venue). Tap “Open in Maps” for turn-by-turn.' },
  { icon: MessagesSquare, h: 'Must-haves & itinerary', p: 'In Discussion, post must-haves / dealbreakers and the trip itinerary. The organizer approves must-haves, then Scout weighs them in every ranking and compare.' },
  { icon: Scale, h: 'Compare', p: 'Tick two or more homes and hit Compare for a side-by-side with Scout’s verdict. Comparisons are cached, so re-opening one is instant, with no re-charge.' },
  { icon: Users, h: 'Community submissions', p: 'Homes anyone adds appear under “From your group”. The same villa added from two sites is automatically de-duplicated so it shows once.' },
  { icon: Trophy, h: 'Decision & leaderboard', p: 'Everyone casts one top choice. The Decision tab shows the live leaderboard and how many people have voted, so you know when you’re ready to lock.' },
  { icon: UserPlus, h: 'Invite the group', p: 'Manage trip → copy the invite link or send email invites. Guests can browse instantly and sign in with a one-tap email link to vote or add homes.' },
];

const FAQ = [
  { q: 'How do I add a home?', a: 'On the board, tap Add (the + button) and paste any Airbnb, VRBO, Booking, or villa link (an optional price helps if the page hides it). GroupPad scrapes the details, prices it all-in, and drops it into your group’s submissions to vote on.' },
  { q: 'How does Scout rank the homes?', a: 'Scout (our AI) reads your trip itinerary, budget, and the group’s approved must-haves, then scores every home across cost, per-person price, distance to your plans, capacity, amenities and ratings. Over-budget and unavailable homes are kept out of Recommended. Rankings are cached and shared with the whole group, so nobody pays for the same comparison twice.' },
  { q: 'Why does a home have no price?', a: 'Some boutique sites hide prices behind a date picker. GroupPad tries the page, a real headless browser, and a nightly-rate fallback, but if all fail it marks the home “check manually”. Add a price when you submit, or open the listing to confirm; it then folds into the budget math and ranking.' },
  { q: 'How do I invite people?', a: 'Open Manage trip → copy the invite link and share it anywhere. Anyone with the link can view the board; they sign in with a one-tap link to vote or add homes. You can also send email invites from the same screen.' },
  { q: 'How do we change the official pick?', a: 'The organizer can Unlock the current pick from the board or from Manage → Danger zone (“Reset the official pick”). All votes are kept, so the group can keep deciding and lock a new winner.' },
  { q: 'How do I delete a trip?', a: 'Manage trip → Danger zone → Delete trip. It asks you to type DELETE to confirm, then removes the board, listings, and votes for everyone. This can’t be undone.' },
];

export function HelpView() {
  const { trip } = useApp();
  const [open, setOpen] = useState(0);
  const isMobile = useIsMobile();
  const boardHref = trip ? `/t/${trip.id}/board` : '/trips';

  if (isMobile) return <MobileHelp />;

  return (
    <main className="uu-main">
      <div className="tp-wrap uu-wrap">
        <Link className="uu-back" to={boardHref}><Icon icon={ArrowLeft} className="ico" /> Back to board</Link>

        <div className="help-head">
          <div className="ey">How GroupPad works</div>
          <h1>Pick one rental, together.</h1>
          <p>GroupPad turns “where should we stay?” into one shared board. Here’s the whole loop, step by step, plus every feature and the common questions.</p>
        </div>

        <div className="help-steps">
          {STEPS.map((s, i) => (
            <div className={`help-step${s.gold ? ' gold' : ''}`} key={s.h}>
              <div className="help-step-art"><img src={s.img} alt="" loading="lazy" decoding="async" /></div>
              <div className="help-step-body">
                <div className="step">{s.step}</div>
                <h3>{s.h}</h3>
                <p>{s.p}</p>
              </div>
              {i < STEPS.length - 1 && <div className="help-step-line" aria-hidden />}
            </div>
          ))}
        </div>

        <h2 className="help-subh">Every feature</h2>
        <div className="help-features">
          {FEATURES.map((f) => (
            <div className="help-feat" key={f.h}>
              <div className="ic"><Icon icon={f.icon} className="ico" /></div>
              <h3>{f.h}</h3>
              <p>{f.p}</p>
            </div>
          ))}
        </div>

        <div className="faq-wrap">
          <h2>Common questions</h2>
          <div className="faq">
            {FAQ.map((f, i) => (
              <div className={`faq-item${open === i ? ' open' : ''}`} key={f.q}>
                <button
                  className="faq-q"
                  onClick={() => setOpen(open === i ? -1 : i)}
                  aria-expanded={open === i}
                  style={{ width: '100%', background: 'none', border: 0, font: 'inherit', textAlign: 'left' }}
                >
                  <Icon icon={HelpCircle} className="ico-lead" />
                  <span className="q">{f.q}</span>
                  <Icon icon={ChevronDown} className="chev" />
                </button>
                <div className="faq-a">{f.a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

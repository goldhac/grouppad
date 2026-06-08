import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Moon, Sun, LayoutGrid, Sparkles, HelpCircle, ChevronDown,
  SlidersHorizontal, Bookmark, Map as MapIcon, MessagesSquare, Scale, Users, Trophy, UserPlus,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

const STEPS = [
  { img: '/onboarding/01-board.webp', step: 'The core loop', h: 'One board for the whole group', p: 'Every idea lands on one shared board instead of scattering across a 200-message group chat. Open the trip and you’re on the board.' },
  { img: '/onboarding/02-add.webp', step: 'Step 1 · Add homes', h: 'Paste any rental link', p: 'Tap Add (+) and paste an Airbnb, VRBO, Booking, or villa link. GroupPad scrapes photos, beds and amenities and prices it all-in. No price on the page? Add one manually.' },
  { img: '/onboarding/06-scout.webp', step: 'Step 2 · Scout ranks', h: 'Recommended, ranked by AI', p: 'Scout reads your itinerary, budget and must-haves, then ranks every home — curated, live and community — best-to-worst. Recommended shows the top 10 within budget, each with a “why”.' },
  { img: '/onboarding/03-vote.webp', step: 'Step 3 · Vote', h: 'Vote in the open', p: 'Public thumbs, not secret hearts. Any home that reaches net +1 rises into the Group’s Shortlist on its own.' },
  { img: '/onboarding/04-perperson.webp', step: 'Step 4 · The number', h: 'The per-person cost', p: 'Every home shows the real all-in cost split across your group, recomputed live as people join. Use the Split slider to model a different headcount.' },
  { img: '/onboarding/05-lock.webp', step: 'Step 5 · Decide', h: 'Compare with Scout, then lock it', p: 'Down to a few? Ask Scout to compare them head-to-head and call a winner. The organizer makes one pick official with the gold lock.', gold: true },
];
const FEATURES = [
  { icon: SlidersHorizontal, h: 'Filters', p: 'Under-budget, pool, parking, hot tub, or a minimum “sleeps”. Filters stick per-trip and only reset when you sign out.' },
  { icon: Bookmark, h: 'Saved (private)', p: 'Bookmark homes to a Saved list only you see. Ask Scout to rank just your saved picks — it never touches the group board.' },
  { icon: MapIcon, h: 'Map & distances', p: 'Open any home for a map and drive-time chips to the airport, downtown and your venue. Tap “Open in Maps” for directions.' },
  { icon: MessagesSquare, h: 'Must-haves & itinerary', p: 'Post must-haves and the itinerary in Discussion. Once approved, Scout weighs them in every ranking and compare.' },
  { icon: Scale, h: 'Compare', p: 'Tick two or more homes and Compare for a side-by-side with Scout’s verdict. Results are cached, so re-opening is instant.' },
  { icon: Users, h: 'Community submissions', p: 'Homes anyone adds show under “From your group”. The same villa added from two sites is de-duplicated automatically.' },
  { icon: Trophy, h: 'Decision & leaderboard', p: 'Everyone casts one top choice. The Decision tab shows the live leaderboard and who’s voted, so you know when to lock.' },
  { icon: UserPlus, h: 'Invite the group', p: 'Manage → copy the invite link or send email invites. Guests browse instantly and sign in with a one-tap email link.' },
];
const FAQ = [
  { q: 'How do I add a home?', a: 'Tap Add (+) and paste any Airbnb, VRBO, Booking, or villa link (an optional price helps if the page hides it). GroupPad scrapes the details, prices it all-in, and drops it into your group\'s submissions to vote on.' },
  { q: 'How does Scout rank the homes?', a: 'Scout reads your itinerary, budget and the group’s approved must-haves, then scores every home on cost, per-person price, distance, capacity, amenities and ratings. Over-budget homes stay out of Recommended. Rankings are cached and shared with everyone — nobody pays for the same comparison twice.' },
  { q: 'Why does a home have no price?', a: 'Some boutique sites hide prices behind a date picker. GroupPad tries the page, a real headless browser, and a nightly-rate fallback; if all fail it marks the home “check manually”. Add a price when you submit and it folds into the budget math and ranking.' },
  { q: 'How do I invite people?', a: 'Open Manage trip → copy the invite link and share it anywhere. Anyone with the link can view the board; they sign in with a one-tap link to vote or add homes. You can also send email invites from the same screen.' },
  { q: 'How do we change the official pick?', a: 'The organizer can unlock the current pick from the board or from Manage → Danger zone ("Reset the official pick"). All votes are kept, so the group can keep deciding and lock a new winner.' },
  { q: 'How do I delete a trip?', a: 'Manage trip → Danger zone → Delete trip. It asks you to type DELETE to confirm, then removes the board, listings, and votes for everyone. This can\'t be undone.' },
];

export function MobileHelp() {
  const { trip } = useApp();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light');
  const [open, setOpen] = useState(0);
  const toggleTheme = () => { const next = theme === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', next); try { localStorage.setItem('gp_theme', next); } catch { /**/ } setTheme(next); };
  const toBoard = () => navigate(trip ? `/t/${trip.id}/board` : '/trips');

  return (
    <div className="gp-mobile">
      <div className="mb">
        <div className="mb-top"><div className="pg-top"><div className="row">
          <span className="pg-back" onClick={toBoard}><Icon icon={ArrowLeft} className="ico" /> Board</span>
          <span className="ttl">How it works</span><span className="spacer" />
          <button className="iconbtn" onClick={toggleTheme} aria-label="Theme"><Icon icon={theme === 'dark' ? Sun : Moon} className="ico" /></button>
        </div></div></div>
        <div className="mb-scroll" style={{ paddingBottom: 32 }}>
          <div className="help">
            <div className="help-head"><span className="ey"><Icon icon={Sparkles} className="ico" /> How GroupPad works</span><h1>Pick one rental, together.</h1><p>GroupPad turns "where should we stay?" into one shared board. Here's the whole loop, step by step — plus every feature.</p></div>
            <div className="help-steps">
              {STEPS.map((s) => (
                <div className={cn('help-step', s.gold && 'gold')} key={s.h}>
                  <div className="help-step-art"><img src={s.img} alt="" loading="lazy" decoding="async" /></div>
                  <div className="help-step-body"><div className="step">{s.step}</div><h3>{s.h}</h3><p>{s.p}</p></div>
                </div>
              ))}
            </div>
            <h2 className="help-subh">Every feature</h2>
            <div className="help-features">
              {FEATURES.map((f) => (
                <div className="help-feat" key={f.h}><div className="ic"><Icon icon={f.icon} className="ico" /></div><h3>{f.h}</h3><p>{f.p}</p></div>
              ))}
            </div>
            <div className="faq-wrap"><h2>Common questions</h2><div className="faq">
              {FAQ.map((f, i) => (
                <div className={cn('faq-item', open === i && 'open')} key={i}>
                  <button className="faq-q" onClick={() => setOpen(open === i ? -1 : i)}><Icon icon={HelpCircle} className="ico ico-lead" /><span className="q">{f.q}</span><Icon icon={ChevronDown} className="ico chev" /></button>
                  <div className="faq-a"><div className="faq-a-in">{f.a}</div></div>
                </div>
              ))}
            </div></div>
            <div className="help-cta"><button className="btn btn-primary" onClick={toBoard}><Icon icon={LayoutGrid} className="ico" /> Open the board</button></div>
            <div style={{ height: 24 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

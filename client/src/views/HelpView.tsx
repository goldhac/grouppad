import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, LayoutGrid, Link2, ThumbsUp, Users, BadgeCheck, HelpCircle, ChevronDown } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';

const CARDS = [
  { icon: LayoutGrid, step: 'The core loop', h: 'One board for the group', p: 'Everyone’s ideas land on one shared board — no more rentals lost in a 200-message group chat.' },
  { icon: Link2, step: 'Step 1', h: 'Browse & add any rental', p: 'Paste an Airbnb, VRBO, or Booking link — or let GroupPad pull fresh homes for your dates. Each is priced and placed automatically.' },
  { icon: ThumbsUp, step: 'Step 2', h: 'Vote in the open', p: 'Public thumbs, not secret hearts. Any home that reaches net +1 rises into the group’s shortlist on its own.' },
  { icon: Users, step: 'The signature', h: 'The per-person number', p: 'Every home shows the real all-in cost split across your group — the figure people actually argue about — recomputed live as the group changes.' },
  { icon: BadgeCheck, step: 'The decision', h: 'Compare with Scout & lock the pick', p: 'Down to two? Scout weighs price, distance, and your must-haves and calls a winner. The organizer makes one pick official for everyone.', gold: true },
];

const FAQ = [
  { q: 'How do I add a home?', a: 'On the board, paste any Airbnb, VRBO, or Booking link into “Add a listing” (an optional price helps if the page hides it). GroupPad scrapes the details, prices it all-in, and drops it into Community Submissions for the group to vote on.' },
  { q: 'How do I invite people?', a: 'Open Manage trip → copy the invite link and share it anywhere. Anyone with the link can view the board; they sign in with a one-tap link to vote or add homes. You can also send email invites from the same screen.' },
  { q: 'How do we change the official pick?', a: 'The organizer can Unlock the current pick from the board or from Manage → Danger zone (“Reset the official pick”). All votes are kept, so the group can keep deciding and lock a new winner.' },
  { q: 'How do I delete a trip?', a: 'Manage trip → Danger zone → Delete trip. It asks you to type DELETE to confirm, then removes the board, listings, and votes for everyone. This can’t be undone.' },
];

export function HelpView() {
  const { trip } = useApp();
  const [open, setOpen] = useState(0);
  const boardHref = trip ? `/t/${trip.id}/board` : '/trips';

  return (
    <main className="uu-main">
      <div className="tp-wrap uu-wrap">
        <Link className="uu-back" to={boardHref}><Icon icon={ArrowLeft} className="ico" /> Back to board</Link>

        <div className="help-head">
          <div className="ey">How GroupPad works</div>
          <h1>Pick one rental, together.</h1>
          <p>GroupPad turns “where should we stay?” into one shared board. Here’s the whole loop — it takes about a minute to get going.</p>
        </div>

        <div className="help-grid five">
          {CARDS.map((c, i) => (
            <div className={`help-card${c.gold ? ' gold' : ''}${i === 4 ? ' span-row' : ''}`} key={c.h}>
              <div className="ic"><Icon icon={c.icon} className="ico" /></div>
              <div className="step">{c.step}</div>
              <h3>{c.h}</h3>
              <p>{c.p}</p>
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

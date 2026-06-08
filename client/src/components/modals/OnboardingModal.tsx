import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { Avatar, AVATARS } from '@/components/ui/Avatar';
import { useFocusTrap } from '@/lib/useFocusTrap';

function AvatarPickArt() {
  const { user, setAvatar } = useApp();
  return (
    <div className="obv obv-avatars">
      <div className="ob-avgrid">
        {AVATARS.map((a) => (
          <button
            key={a}
            className={`ob-avopt${user?.avatar === a ? ' on' : ''}`}
            onClick={() => void setAvatar(a)}
            aria-label={`Use the ${a} avatar`}
          >
            <Avatar avatar={a} size={62} />
          </button>
        ))}
        <button
          className={`ob-avopt${!user?.avatar ? ' on' : ''}`}
          onClick={() => void setAvatar(null)}
          aria-label="Use your initials"
        >
          <Avatar name={user?.name} size={62} />
        </button>
      </div>
    </div>
  );
}

/** Generated warm-editorial illustrations for the 5 walkthrough steps.
 *  (Brand-matched: cream ground, teal accents, gold reserved for the lock step.) */
function StepImg({ src, alt }: { src: string; alt: string }) {
  return <img className="obv-img" src={src} alt={alt} loading="lazy" decoding="async" />;
}
const BoardArt = () => <StepImg src="/onboarding/01-board.webp" alt="Friends pinning rental homes onto one shared board" />;
const AddArt = () => <StepImg src="/onboarding/02-add.webp" alt="Pasting a rental link to add a home to the board" />;
const ScoutArt = () => <StepImg src="/onboarding/06-scout.webp" alt="Scout the guide ranking homes best-to-worst with a gold top pick" />;
const VoteArt = () => <StepImg src="/onboarding/03-vote.webp" alt="The group giving thumbs-up to favourite homes" />;
const PpArt = () => <StepImg src="/onboarding/04-perperson.webp" alt="A home's cost split into fair per-person shares" />;
const LockArt = () => <StepImg src="/onboarding/05-lock.webp" alt="Scout picking the winner and the organizer locking it official" />;

const SLIDES = [
  { tag: 'Welcome', h: 'Pick your avatar', p: 'Choose a character so your group knows who’s who — or keep your initials. You can change it anytime from your account menu.', v: 'v0', Art: AvatarPickArt },
  { tag: 'Step 1 of 8', h: 'One board, three sections', p: 'Everything for the trip lives on one board: Recommended (Scout’s ranked top homes), From your group (anything members add), and More homes (auto-pulled live listings). No more links lost in the chat.', v: 'v1', Art: BoardArt },
  { tag: 'Step 2 of 8', h: 'Add any rental — community submissions', p: 'Tap Add (+) and paste an Airbnb, VRBO, Booking or villa link. It’s scraped, priced all-in, and lands under “From your group” for everyone to weigh in on.', v: 'v2', Art: AddArt },
  { tag: 'Step 3 of 8', h: 'Scout ranks every home for your trip', p: 'Our AI reads your itinerary, budget, and must-haves, then sorts the board best-to-worst — each home shows a one-line “why it ranks here.” Only homes within budget make Recommended.', v: 'v6', Art: ScoutArt },
  { tag: 'Step 4 of 8', h: 'Vote — and watch the shortlist build', p: 'Shared thumbs, not secret hearts. Any home the group likes rises into the Group’s Shortlist on its own.', v: 'v3', Art: VoteArt },
  { tag: 'Step 5 of 8', h: 'The number that ends the argument', p: 'Every home shows the real all-in cost split across your group — recomputed live as people join. Tap a home for the full breakdown, a map, and guest reviews.', v: 'v4', Art: PpArt },
  { tag: 'Step 6 of 8', h: 'Compare finalists with Scout', p: 'Tick two or more homes and hit Compare — Scout weighs price, distance and your must-haves side-by-side and calls a winner. Results are saved, so re-opening a compare is instant.', v: 'v6', Art: ScoutArt },
  { tag: 'Step 7 of 8', h: 'AI video walkthrough', p: 'On a home you’re serious about, generate an AI walkthrough — a short narrated video tour of the best spaces — so the whole group gets a feel for it without a dozen tabs.', v: 'v2', Art: AddArt },
  { tag: 'Step 8 of 8', h: 'Cast your top choice, then lock it', p: 'Everyone stars one top choice; the leaderboard shows where the group stands. The organizer makes one home the official pick — it gets the gold seal and leaves the shortlist. Done.', v: 'v5', Art: LockArt },
];

export function OnboardingModal() {
  const { onboardingOpen, endOnboarding } = useApp();
  const [idx, setIdx] = useState(0);
  const scrimRef = useRef<HTMLDivElement>(null);
  useFocusTrap(scrimRef, onboardingOpen);

  useEffect(() => { if (onboardingOpen) setIdx(0); }, [onboardingOpen]);
  useEffect(() => {
    if (!onboardingOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endOnboarding();
      else if (e.key === 'ArrowRight') setIdx((i) => Math.min(SLIDES.length - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onboardingOpen, endOnboarding]);

  if (!onboardingOpen) return null;
  const s = SLIDES[idx];
  const last = idx === SLIDES.length - 1;
  const close = () => { setIdx(0); endOnboarding(); };

  return (
    <div className="modal-scrim open" onClick={close}>
      <div className="modal ob" role="dialog" aria-modal="true" aria-labelledby="obTitle" onClick={(e) => e.stopPropagation()}>
        <button className="ob-skip" onClick={close}>Skip tour</button>
        <div className={`ob-visual ${s.v}`}>
          <div className="ob-slide anim" key={`v${idx}`}><s.Art /></div>
        </div>
        <div className="ob-body">
          <div className="ob-slidewrap">
            <div className="ob-slide anim" key={`t${idx}`}>
              <div className="ob-step-tag">{s.tag}</div>
              <h2 id="obTitle">{s.h}</h2>
              <p>{s.p}</p>
            </div>
          </div>
          <div className="ob-foot">
            <div className="ob-dots">{SLIDES.map((_, i) => <i key={i} className={i === idx ? 'on' : ''} />)}</div>
            <div className="ob-nav">
              {idx > 0 && <button className="btn btn-ghost" onClick={() => setIdx((i) => i - 1)}><Icon icon={ArrowLeft} className="ico" /> Back</button>}
              {last
                ? <button className="btn btn-primary" onClick={close}><Icon icon={ArrowRight} className="ico" /> Start planning</button>
                : <button className="btn btn-primary" onClick={() => setIdx((i) => i + 1)}>Next <Icon icon={ArrowRight} className="ico" /></button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

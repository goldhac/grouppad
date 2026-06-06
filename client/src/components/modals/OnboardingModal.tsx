import { useEffect, useRef, useState } from 'react';
import { Link2, ArrowUp, ThumbsUp, ThumbsDown, Users, ArrowLeft, ArrowRight } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { SealMark } from '@/components/ui/SealMark';
import { useFocusTrap } from '@/lib/useFocusTrap';

function BoardArt() {
  return (
    <div className="obv obv-board-wrap">
      <div className="obv-board">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="c" key={i}><div className="p" /><div className="l" /><div className="l s" /></div>
        ))}
      </div>
      <div className="obv-avatars">
        <span className="av">MA</span>
        <span className="av" style={{ background: 'var(--c-indigo-600)' }}>JL</span>
        <span className="av" style={{ background: 'var(--c-cyan-600)' }}>RP</span>
        <span className="av" style={{ background: 'var(--surface-sunken)', color: 'var(--text-2)' }}>+11</span>
      </div>
    </div>
  );
}
function AddArt() {
  return (
    <div className="obv obv-add">
      <div className="bar"><Icon icon={Link2} className="ico" /><span className="ph" /><span className="go">Add</span></div>
      <div className="src"><span>airbnb</span><span>VRBO</span><span>Booking</span><span>live LA</span></div>
    </div>
  );
}
function VoteArt() {
  return (
    <div className="obv obv-vote">
      <span className="rise"><Icon icon={ArrowUp} className="ico" /> Rose to shortlist</span>
      <div className="mini-card"><div className="p" /><div className="l" /><div className="l" style={{ width: '55%' }} /></div>
      <div className="votebar">
        <button className="vote up on"><Icon icon={ThumbsUp} className="ico" /></button>
        <span className="net pos tnum">+5</span>
        <button className="vote down"><Icon icon={ThumbsDown} className="ico" /></button>
      </div>
    </div>
  );
}
function PpArt() {
  return (
    <div className="obv obv-pp">
      <div className="big tnum">$359</div>
      <div className="lab"><Icon icon={Users} className="ico" /> per person · split 14 ways</div>
      <div className="strike"><b>$5,022</b> all-in · 5 nights</div>
    </div>
  );
}
function LockArt() {
  return (
    <div className="obv obv-lock">
      <SealMark size={76} play />
      <span className="chip"><span className="gdot" /> Official pick · locked</span>
    </div>
  );
}

const SLIDES = [
  { tag: 'Step 1 of 5', h: 'One board for the whole group', p: 'Everyone’s ideas land in one place — no more links lost in the group chat.', v: 'v1', Art: BoardArt },
  { tag: 'Step 2 of 5', h: 'Browse & add any rental', p: 'Paste an Airbnb, VRBO, or Booking link — or let GroupPad pull fresh homes for your dates.', v: 'v2', Art: AddArt },
  { tag: 'Step 3 of 5', h: 'Vote in the open', p: 'Shared thumbs, not secret hearts. Liked homes rise into the group’s shortlist on their own.', v: 'v3', Art: VoteArt },
  { tag: 'Step 4 of 5', h: 'The number that ends the argument', p: 'Every home shows the real all-in cost split across your group — recomputed live as it grows.', v: 'v4', Art: PpArt },
  { tag: 'Step 5 of 5', h: 'Compare with Scout, then lock it', p: 'Down to two? Scout calls the winner. The organizer makes it official — and the debate is over.', v: 'v5', Art: LockArt },
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

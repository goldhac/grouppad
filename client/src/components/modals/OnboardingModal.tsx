import { useState } from 'react';
import { useApp } from '@/store/AppContext';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

interface Slide {
  icon: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: '🏡',
    title: 'Welcome to GroupPad',
    body: "One shared board to pick the LA house for 14 — together. Here's the 30-second tour.",
  },
  {
    icon: '👍',
    title: 'Browse & like',
    body: 'Skim every 7+ bedroom home. Open any card for full photos, the price broken down, your per-person share, and a map. 👍 the ones you\'d actually stay in.',
  },
  {
    icon: '⭐',
    title: 'Shortlist & compare',
    body: 'Liked homes rise into a shared shortlist. Tap 🤖 Compare with AI to weigh them against the itinerary and budget — or tick two cards for a 1v1.',
  },
  {
    icon: '✅',
    title: 'Pick the winner',
    body: 'Everyone casts one ⭐ top choice (your individual pick stays private — only totals show). The organizer locks the ✅ official pick when the group converges.',
  },
  {
    icon: '➕',
    title: 'Add & sign in',
    body: 'Found one we missed? Paste any VRBO / Airbnb / Booking.com link to add it. Sign in with Google or an email link so your votes follow you across devices.',
  },
];

export function OnboardingModal() {
  const { onboardingOpen, endOnboarding } = useApp();
  const [idx, setIdx] = useState(0);
  const slide = SLIDES[idx];
  const last = idx === SLIDES.length - 1;

  const close = () => {
    setIdx(0);
    endOnboarding();
  };

  return (
    <Dialog open={onboardingOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent width="max-w-md" showClose={false}>
        <div className="flex items-center justify-end">
          <button className="text-xs text-muted hover:text-text" onClick={close}>
            Skip
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 px-2 py-4 text-center">
          <div className="text-5xl">{slide.icon}</div>
          <DialogTitle className="text-xl font-bold">{slide.title}</DialogTitle>
          <p className="max-w-xs text-sm leading-relaxed text-muted">{slide.body}</p>
        </div>

        <div className="flex justify-center gap-1.5">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={cn('h-1.5 rounded-full transition-all', i === idx ? 'w-5 bg-accent' : 'w-1.5 bg-border')}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))} className={cn(idx === 0 && 'invisible')}>
            Back
          </Button>
          <Button variant="primary" onClick={() => (last ? close() : setIdx((i) => i + 1))}>
            {last ? 'Get started' : 'Next'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

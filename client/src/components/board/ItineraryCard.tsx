import { useEffect, useState } from 'react';
import { Map, X, ArrowRight } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';

/** Itinerary shown as a visual "map" card; tapping opens a popup with the full
 *  text. Shared by the desktop board and the mobile shell. Renders nothing when
 *  no itinerary has been posted (the owner editor handles the empty state). */
export function ItineraryCard() {
  const { itinerary } = useApp();
  const [open, setOpen] = useState(false);
  const text = itinerary?.text?.trim() || '';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!text) return null;
  const teaser = text.replace(/\s+/g, ' ').slice(0, 150);

  return (
    <>
      <button className="itin-card" onClick={() => setOpen(true)} aria-label="Open the full trip itinerary">
        <div className="itin-card-art" aria-hidden>
          <svg viewBox="0 0 140 96" preserveAspectRatio="xMidYMid slice">
            <path className="route" d="M16 78 C 40 78, 38 40, 60 40 S 96 64, 124 22" fill="none" strokeDasharray="4 7" strokeLinecap="round" />
            <circle className="pin a" cx="16" cy="78" r="5" />
            <circle className="pin b" cx="60" cy="40" r="5" />
            <circle className="pin c" cx="124" cy="22" r="6" />
          </svg>
          <span className="itin-card-icon"><Icon icon={Map} className="ico" /></span>
        </div>
        <div className="itin-card-body">
          <div className="itin-card-tag">Trip itinerary</div>
          <div className="itin-card-teaser">{teaser}{text.length > 150 ? '…' : ''}</div>
          <div className="itin-card-cta">Read the full plan <Icon icon={ArrowRight} className="ico" /></div>
        </div>
      </button>

      {open && (
        <div className="itin-modal-scrim" onClick={() => setOpen(false)}>
          <div className="itin-modal" role="dialog" aria-modal="true" aria-label="Trip itinerary" onClick={(e) => e.stopPropagation()}>
            <div className="itin-modal-head">
              <span className="h"><Icon icon={Map} className="ico" /> Trip itinerary</span>
              <button className="x" onClick={() => setOpen(false)} aria-label="Close"><Icon icon={X} className="ico" /></button>
            </div>
            <div className="itin-modal-body"><p>{text}</p></div>
          </div>
        </div>
      )}
    </>
  );
}

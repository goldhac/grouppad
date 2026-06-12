import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/store/AppContext';
import { Avatar } from '@/components/ui/Avatar';

/** "Who's coming" — an avatar stack of the trip's members that opens a roster
 *  popover. Visible to members (guests have an empty roster, so it hides). */
export function WhosComing({ compact = false }: { compact?: boolean }) {
  const { roster } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!roster.length) return null;
  const shown = roster.slice(0, compact ? 3 : 4);
  const extra = roster.length - shown.length;

  return (
    <div className={`wc${compact ? ' wc-compact' : ''}`} ref={ref}>
      <button className="wc-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Who's coming — ${roster.length} ${roster.length === 1 ? 'person' : 'people'}`}>
        <span className="wc-stack">
          {shown.map((m) => (
            <span className="wc-av" key={m.id}><Avatar name={m.name} avatar={m.avatar} size={compact ? 22 : 26} /></span>
          ))}
          {extra > 0 && <span className="wc-more tnum">+{extra}</span>}
        </span>
        <span className="wc-label">{compact ? roster.length : `${roster.length} going`}</span>
      </button>

      {open && (
        <div className="wc-pop" role="dialog" aria-label="Who's coming">
          <div className="wc-pop-h">Who&rsquo;s coming <span className="wc-pop-n tnum">{roster.length}</span></div>
          <ul className="wc-list">
            {roster.map((m) => (
              <li key={m.id} className="wc-row">
                <Avatar name={m.name} avatar={m.avatar} size={30} />
                <span className="wc-name">{m.name}{m.isYou && <span className="wc-you"> (you)</span>}</span>
                {(m.role === 'organizer' || m.isCreator) && (
                  <span className="wc-role">{m.isCreator ? 'Creator' : 'Organizer'}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

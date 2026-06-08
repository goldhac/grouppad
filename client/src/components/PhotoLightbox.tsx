import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';

type XY = { x: number; y: number };
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);

/** Fullscreen photo viewer with swipe-between-photos, pinch-zoom, double-tap
 *  zoom, and one-finger pan when zoomed. Pointer-event based so it works on
 *  iOS Safari, Android, and desktop. */
export function PhotoLightbox({ photos, start = 0, onClose }: { photos: string[]; start?: number; onClose: () => void }) {
  const [idx, setIdx] = useState(start);
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const pts = useRef<Map<number, XY>>(new Map());
  const pinch = useRef<{ dist: number; s: number } | null>(null);
  const lastTap = useRef(0);
  const swipeStart = useRef<number | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  const reset = () => setT({ s: 1, x: 0, y: 0 });
  const go = (n: number) => { setIdx((n + photos.length) % photos.length); reset(); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(idx + 1);
      else if (e.key === 'ArrowLeft') go(idx - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, photos.length]);

  const down = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      pinch.current = { dist: dist(a, b), s: tRef.current.s };
      swipeStart.current = null;
    } else if (pts.current.size === 1) {
      swipeStart.current = e.clientX;
      const now = Date.now();
      if (now - lastTap.current < 300) { // double-tap → toggle zoom
        setT((p) => (p.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.6, x: 0, y: 0 }));
        lastTap.current = 0;
      } else lastTap.current = now;
    }
  };

  const move = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    const prev = pts.current.get(e.pointerId)!;
    const cur = { x: e.clientX, y: e.clientY };
    pts.current.set(e.pointerId, cur);
    if (pts.current.size === 2 && pinch.current) {
      const [a, b] = [...pts.current.values()];
      const s = Math.min(5, Math.max(1, pinch.current.s * (dist(a, b) / Math.max(1, pinch.current.dist))));
      setT((p) => ({ ...p, s }));
    } else if (pts.current.size === 1 && tRef.current.s > 1) {
      setT((p) => ({ ...p, x: p.x + (cur.x - prev.x), y: p.y + (cur.y - prev.y) }));
    }
  };

  const up = (e: React.PointerEvent) => {
    const start = swipeStart.current;
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    if (pts.current.size === 0) {
      if (tRef.current.s <= 1.02) {
        reset();
        if (start != null && photos.length > 1) {
          const dx = e.clientX - start;
          if (Math.abs(dx) > 55) go(dx < 0 ? idx + 1 : idx - 1);
        }
      }
      swipeStart.current = null;
    }
  };

  return (
    <div className="plb" role="dialog" aria-modal="true">
      <button className="plb-x" onClick={onClose} aria-label="Close"><Icon icon={X} className="ico" /></button>
      <div className="plb-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <img
          src={photos[idx]}
          alt=""
          draggable={false}
          style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transition: pts.current.size ? 'none' : 'transform 0.18s ease-out' }}
        />
      </div>
      {photos.length > 1 && (
        <>
          <button className="plb-nav l" onClick={() => go(idx - 1)} aria-label="Previous"><Icon icon={ChevronLeft} className="ico" /></button>
          <button className="plb-nav r" onClick={() => go(idx + 1)} aria-label="Next"><Icon icon={ChevronRight} className="ico" /></button>
          <div className="plb-dots">{photos.map((_, i) => <i key={i} className={i === idx ? 'act' : ''} />)}</div>
          <div className="plb-count tnum">{idx + 1} / {photos.length}</div>
        </>
      )}
    </div>
  );
}

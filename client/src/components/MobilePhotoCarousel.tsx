import { useRef, useState, type ReactNode } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';

/** Native CSS scroll-snap photo carousel for the mobile shell — swipe through
 *  every photo with real dot indicators. Used on board cards and the detail
 *  hero. `onPhotoTap` fires on a tap (not a swipe) of the current image. */
export function MobilePhotoCarousel({
  photos,
  alt = '',
  onPhotoTap,
  className = '',
  children,
}: {
  photos?: string[];
  alt?: string;
  onPhotoTap?: (idx: number) => void;
  className?: string;
  children?: ReactNode;
}) {
  const list = photos && photos.length ? photos : [];
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const downX = useRef(0);
  const downT = useRef(0);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== idx) setIdx(i);
  };

  if (!list.length) {
    return (
      <div className={`pcar-wrap ${className}`}>
        <div className="pcar-fallback"><Icon icon={ImageIcon} className="ico" /></div>
        {children}
      </div>
    );
  }

  return (
    <div className={`pcar-wrap ${className}`}>
      <div
        className="pcar"
        ref={ref}
        onScroll={onScroll}
        onPointerDown={(e) => { downX.current = e.clientX; downT.current = Date.now(); }}
        onClick={(e) => {
          // Only treat as a tap (open zoom) if the finger didn't travel/swipe.
          if (Math.abs(e.clientX - downX.current) < 8 && Date.now() - downT.current < 500) onPhotoTap?.(idx);
        }}
      >
        {list.map((p, i) => (
          <div className="pcar-slide" key={i}>
            <img src={p} alt={alt} loading={i === 0 ? 'eager' : 'lazy'} draggable={false}
              onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
          </div>
        ))}
      </div>
      {list.length > 1 && (
        <div className="pcar-dots">
          {list.map((_, i) => <i key={i} className={i === idx ? 'act' : ''} />)}
        </div>
      )}
      {children}
    </div>
  );
}

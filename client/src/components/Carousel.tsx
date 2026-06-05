import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import { SafeImg } from '@/components/ui/SafeImg';

/** v2 card photo block: image + prev/next + dot indicators. Renders inside the
 *  `.card .photo` element; overlays (corner / star) are passed as children and
 *  positioned absolutely by the card CSS. Stops propagation so the carousel
 *  controls don't trigger the card's open-detail handler. */
export function Carousel({
  photos,
  alt,
  children,
}: {
  photos: string[] | undefined;
  alt: string;
  children?: React.ReactNode;
}) {
  const [idx, setIdx] = useState(0);
  const list = photos && photos.length > 0 ? photos : [''];
  const go = (n: number) => setIdx((n + list.length) % list.length);

  return (
    <div className="photo">
      <SafeImg src={list[idx]} alt={alt} loading="lazy" />
      {list.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            className="carousel-btn l"
            onClick={(e) => { e.stopPropagation(); go(idx - 1); }}
          >
            <Icon icon={ChevronLeft} className="ico" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            className="carousel-btn r"
            onClick={(e) => { e.stopPropagation(); go(idx + 1); }}
          >
            <Icon icon={ChevronRight} className="ico" />
          </button>
          <div className="dots">
            {list.map((_, i) => <i key={i} className={i === idx ? 'act' : ''} />)}
          </div>
        </>
      )}
      {children}
    </div>
  );
}

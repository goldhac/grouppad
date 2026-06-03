import { useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Photo carousel with prev/next + dots. Stops click propagation so it doesn't
 *  trigger the card's open-detail handler. */
export function Carousel({ photos, alt }: { photos: string[] | undefined; alt: string }) {
  const [idx, setIdx] = useState(0);
  const list = photos && photos.length > 0 ? photos : null;

  if (!list) {
    return (
      <div className="flex aspect-[3/2] w-full items-center justify-center bg-panel-2 text-muted">
        <ImageOff className="h-8 w-8 opacity-50" />
        <span className="ml-2 text-xs">no image</span>
      </div>
    );
  }

  const go = (n: number) => setIdx((n + list.length) % list.length);

  return (
    <div className="group relative aspect-[3/2] w-full overflow-hidden bg-panel-2">
      <img
        src={list[idx]}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover"
        draggable={false}
      />
      {list.length > 1 && (
        <>
          <button
            aria-label="Previous photo"
            className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              go(idx - 1);
            }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            aria-label="Next photo"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/55 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              go(idx + 1);
            }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-1">
            {list.map((_, i) => (
              <button
                key={i}
                aria-label={`Photo ${i + 1}`}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === idx ? 'w-4 bg-white' : 'w-1.5 bg-white/50',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  go(i);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

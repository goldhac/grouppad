import { MapPin, ExternalLink } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';
import type { Listing } from '@/types';

/** A lightweight, keyless map preview (OpenStreetMap embed) for a listing, with
 *  the drive-time chips and an "Open in Maps" link. Falls back to chips + link
 *  when no coordinates are available. */
export function MapWidget({ l, compact = false }: { l: Listing; compact?: boolean }) {
  const hasCoords = typeof l.lat === 'number' && typeof l.lng === 'number';
  const dists = l.distances ?? [];
  // Prefer exact coordinates; else search by name + area. Keyless Google embed
  // (same approach as the desktop detail modal) — reliable, no API key needed.
  const query = hasCoords ? `${l.lat},${l.lng}` : [l.name, l.area, 'Los Angeles'].filter(Boolean).join(', ');
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const embed = (hasCoords || l.area || l.name)
    ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=12&output=embed`
    : null;

  if (!embed && dists.length === 0) return null;

  return (
    <div className="mapw">
      {embed && (
        <div className="mapw-frame" style={compact ? { height: 150 } : undefined}>
          <iframe title={`Map of ${l.name}`} src={embed} loading="lazy" referrerPolicy="no-referrer" />
        </div>
      )}
      {dists.length > 0 && (
        <div className="mapw-dists">
          {dists.map((d, i) => (
            <span className="mapw-pill" key={i}>
              <Icon icon={MapPin} className="ico" />
              <span className="tnum">{d.mi} mi</span><span className="sep">·</span>
              <span className="tnum">{d.min} min</span> · {d.label}
            </span>
          ))}
        </div>
      )}
      <a className="mapw-open" href={mapsUrl} target="_blank" rel="noopener noreferrer">
        <Icon icon={MapPin} className="ico" /> {l.area ? l.area.split('·')[0].trim() : 'Open in Maps'} <Icon icon={ExternalLink} className="ico ext" />
      </a>
    </div>
  );
}

import { useMemo } from 'react';
import { Bookmark } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/Card';

/** Each member's own saved homes — a personal shortlist, separate from the
 *  group's net-voted Shortlist. Populated by the save (bookmark) button on a
 *  card and in the detail view. */
export function SavedSection() {
  const { favoriteIds, listings, submitted, pipeline, user, openAuth } = useApp();

  const homes = useMemo(() => {
    const seen = new Set<string>();
    const out = [];
    for (const pool of [listings, submitted, pipeline]) {
      for (const l of pool) if (favoriteIds.has(l.id) && !seen.has(l.id)) { seen.add(l.id); out.push(l); }
    }
    return out;
  }, [favoriteIds, listings, submitted, pipeline]);

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Icon icon={Bookmark} className="ico" />
        <p className="text-text-muted">Sign in to save homes to your own shortlist.</p>
        <button className="btn btn-primary btn-sm" onClick={() => openAuth('save homes')}>Sign in</button>
      </div>
    );
  }

  return (
    <section>
      <div className="row-head">
        <span className="ttl">Saved</span>
        <span className="cnt tnum">{homes.length}</span>
        <span className="sub">your personal shortlist · only you see this</span>
      </div>
      {homes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Icon icon={Bookmark} className="ico" />
          <p className="text-text-muted">
            Nothing saved yet. Tap the <Icon icon={Bookmark} className="ico inline align-text-bottom" /> on any home to keep
            it in your own shortlist — handy for tracking your favourites before the group locks one.
          </p>
        </div>
      ) : (
        <div className="b-grid">
          {homes.map((l) => <Card key={l.id} listing={l} />)}
        </div>
      )}
    </section>
  );
}

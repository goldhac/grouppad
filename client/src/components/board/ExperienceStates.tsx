import { CloudOff, Compass, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Icon } from '@/components/ui/Icon';

/**
 * The four situations the Things-to-do list can be in, which used to render as
 * one. They live here — in ONE component consumed by both the desktop tab and
 * the phone shell — because the last time each surface owned its own copy, the
 * phone quietly kept the conflated version months after the desktop was fixed.
 *
 * The distinction that actually matters is `error` vs `empty`. Every read was
 * once caught and swallowed into an empty list, so a server outage appeared as
 * "no things to do found": the product blaming the group's trip for its own
 * failure, with no way back. An error must say it is ours, promise the votes
 * are safe, and offer a retry.
 *
 * `filtered` is the other easy conflation — if someone's chips exclude
 * everything, the list is not empty, and saying so sends them to refetch data
 * they already have. Name the filters and offer to clear them.
 */
export type ExpListState = 'pending' | 'empty' | 'filtered' | 'error';

export function expListState(o: {
  total: number;      // everything we hold, before filters
  shown: number;      // what survives the current filters
  pending: boolean;
  failed: boolean;
}): ExpListState | null {
  if (o.shown > 0) return null;
  if (o.failed) return 'error';
  if (o.pending) return 'pending';
  return o.total > 0 ? 'filtered' : 'empty';
}

export function ExperienceStates({
  state, destination, total, filterLabel, onRetry, onLookAgain, onClearFilters, className = 'xstate',
}: {
  state: ExpListState;
  destination?: string | null;
  /** Used only by `filtered`, to say how many are still here behind the chips. */
  total?: number;
  /** What the active filter is called, e.g. “Outdoors” or “your saved list”. */
  filterLabel?: React.ReactNode;
  onRetry?: () => void;
  onLookAgain?: () => void;
  onClearFilters?: () => void;
  /** `xstate` on desktop, `xstate xm-state` on the phone. */
  className?: string;
}) {
  const where = destination || 'your destination';

  if (state === 'error') {
    return (
      <div className={`${className} error`}>
        <span className="ic"><Icon icon={CloudOff} className="ico" /></span>
        <div className="kicker">Couldn&rsquo;t load</div>
        <h3>We couldn&rsquo;t reach the list</h3>
        <p>This is on us, not on your trip — <b>your votes are safe</b>. Try again in a moment.</p>
        <span className="row">
          <button className="btn btn-primary btn-sm" onClick={onRetry}>
            <Icon icon={RefreshCw} className="ico" /> Try again
          </button>
        </span>
      </div>
    );
  }

  if (state === 'pending') {
    return (
      <div className={`${className} pending`}>
        <span className="ic"><span className="xspin" /></span>
        <div className="kicker">Working</div>
        <h3>Finding things to do near {where}</h3>
        <p>This usually takes about a minute — you can keep browsing homes and come back.</p>
      </div>
    );
  }

  if (state === 'filtered') {
    return (
      <div className={`${className} filtered`}>
        <span className="ic"><Icon icon={SlidersHorizontal} className="ico" /></span>
        <div className="kicker">Filtered</div>
        {/* Name the filter when the caller knows it — "Nothing in Outdoors" is
            a fact about the chip, while "no matches" sounds like a fact about
            the trip. Fall back to the generic only when it can't be named. */}
        <h3>{filterLabel ? <>Nothing in {filterLabel}</> : 'No matches for these filters'}</h3>
        {/* Say what's still there. "Nothing found" would be a lie — the list is
            intact, it's the chips that are narrow. */}
        <p>Your other {total ?? 0} {total === 1 ? 'thing' : 'things'} to do {total === 1 ? 'is' : 'are'} still here — this filter just has no matches yet.</p>
        <span className="row">
          <button className="btn btn-primary btn-sm" onClick={onClearFilters}>
            <Icon icon={SlidersHorizontal} className="ico" /> Show all {total ?? 0}
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className={`${className} empty`}>
      <span className="ic"><Icon icon={Compass} className="ico" /></span>
      <div className="kicker">Nothing found</div>
      <h3>No things to do for these dates</h3>
      <p>We looked and came back empty — it happens with smaller destinations or tight date windows.</p>
      <span className="row">
        <button className="btn btn-primary btn-sm" onClick={onLookAgain}>
          <Icon icon={RefreshCw} className="ico" /> Look again
        </button>
      </span>
    </div>
  );
}

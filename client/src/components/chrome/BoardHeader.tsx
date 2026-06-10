import { useNavigate } from 'react-router-dom';
import { Calendar, Users, Wallet, Home, Settings, Share2 } from 'lucide-react';
import { useApp, isDeadListing } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtRange(a?: string | null, b?: string | null): string | null {
  if (!a) return null;
  const [ya, ma, da] = a.split('-').map(Number);
  if (!ma) return null;
  const start = `${MON[ma - 1]} ${da}`;
  if (!b) return `${start}, ${ya}`;
  const [yb, mb, db] = b.split('-').map(Number);
  const end = ma === mb ? `${db}` : `${MON[mb - 1]} ${db}`;
  return `${start} – ${end}, ${yb || ya}`;
}

/** The trip-title row of the board masthead: identity + key facts + organizer actions. */
export function BoardHeader() {
  const { trip, pooledListings, isOwner, toast } = useApp();
  const navigate = useNavigate();
  if (!trip) return null;

  // Count real homes only: deduped pool, minus delisted/dead entries and
  // unpriced placeholders. "Under budget" = priced homes at or below the target.
  const live = pooledListings.filter((l) => !isDeadListing(l));
  const homeCount = live.length;
  const underCount = live.filter((l) => l.budget === 'under' || l.budget === 'marginal').length;
  const range = fmtRange(trip.checkin, trip.checkout_5n);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/s/b/${trip.id}`);
      toast('Board link copied — share it with your group.', 'success');
    } catch {
      toast('Could not copy the link.', 'error');
    }
  };

  return (
    <div className="b-title">
      <div>
        <h1>{trip.name}</h1>
        <div className="meta">
          {range && <span className="mi"><Icon icon={Calendar} className="ico" /> {range}</span>}
          <span className="mi"><Icon icon={Users} className="ico" /> {trip.adults} guests</span>
          {trip.budget > 0 && (
            <span className="mi"><Icon icon={Wallet} className="ico" /> <span className="hl tnum">${trip.budget.toLocaleString()}</span> budget</span>
          )}
          {homeCount > 0 && <span className="mi"><Icon icon={Home} className="ico" /> <span className="hl tnum">{homeCount}</span> {homeCount === 1 ? 'home' : 'homes'}</span>}
          {underCount > 0 && <span className="mi"><span className="under tnum">{underCount} under budget</span></span>}
        </div>
      </div>
      <div className="t-actions">
        {isOwner ? (
          <>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => navigate(`/t/${trip.id}/manage`)} title="Manage trip" aria-label="Manage trip">
              <Icon icon={Settings} className="ico" />
            </button>
            <button className="btn btn-primary btn-sm btn-icon" onClick={share} title="Share board" aria-label="Share board">
              <Icon icon={Share2} className="ico" />
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-sm btn-icon" onClick={share} title="Share board" aria-label="Share board">
            <Icon icon={Share2} className="ico" />
          </button>
        )}
      </div>
    </div>
  );
}

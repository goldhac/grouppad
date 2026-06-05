import { useNavigate } from 'react-router-dom';
import { Calendar, Users, Wallet, Home, Settings, Search, Share2 } from 'lucide-react';
import { useApp } from '@/store/AppContext';
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
export function BoardHeader({ onFindMore }: { onFindMore?: () => void }) {
  const { trip, listings, isOwner, toast } = useApp();
  const navigate = useNavigate();
  if (!trip) return null;

  const underCount = listings.filter((l) => l.budget === 'under' || l.budget === 'marginal').length;
  const range = fmtRange(trip.checkin, trip.checkout_5n);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
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
            <span className="mi"><Icon icon={Wallet} className="ico" /> <span className="hl tnum">${trip.budget.toLocaleString()}</span> all-in</span>
          )}
          <span className="mi"><Icon icon={Home} className="ico" /> <span className="hl tnum">{listings.length}</span> homes</span>
          {underCount > 0 && <span className="mi"><span className="under tnum">{underCount} under budget</span></span>}
        </div>
      </div>
      <div className="t-actions">
        {isOwner ? (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/t/${trip.id}/manage`)}>
              <Icon icon={Settings} className="ico" /> Manage
            </button>
            <button className="btn btn-primary btn-sm" onClick={onFindMore}>
              <Icon icon={Search} className="ico" /> Find more
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={share}>
            <Icon icon={Share2} className="ico" /> Share board
          </button>
        )}
      </div>
    </div>
  );
}

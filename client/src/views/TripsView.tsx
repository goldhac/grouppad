import { useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Plus, MapPin, Calendar, Crown, ArrowRight } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { useIsMobile } from '@/lib/useIsMobile';
import { MobileTrips } from '@/views/MobileTrips';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SafeImg } from '@/components/ui/SafeImg';
import type { TripView } from '@/types';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Aug 18 – 23, 2026" from ISO yyyy-mm-dd strings. */
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

const PHOTOS = [
  '1564013799919-ab600027ffc6', '1600585154340-be6161a56a0c', '1600566753086-00f18fb6b3ea',
  '1600047509807-ba8f99d2cdde', '1512917774080-9991f1c4c750', '1600585152220-90363fe7e115',
];
const photoFor = (i: number) => `https://images.unsplash.com/photo-${PHOTOS[i % PHOTOS.length]}?w=720&q=80&auto=format&fit=crop`;
const AV = ['var(--accent)', 'var(--c-indigo-600)', 'var(--c-cyan-600)'];

function Avatars({ count }: { count: number }) {
  const shown = Math.min(Math.max(count, 1), 3);
  return (
    <span className="avs" aria-hidden>
      {Array.from({ length: shown }).map((_, i) => (
        <span key={i} className="av" style={{ background: AV[i % AV.length] }} />
      ))}
      {count > 3 && <span className="av more">+{count - 3}</span>}
    </span>
  );
}

function TripCard({ trip, i }: { trip: TripView; i: number }) {
  const range = fmtRange(trip.checkin, trip.checkout_5n);
  return (
    <Link to={`/t/${trip.id}/board`} className="trip-card hover:no-underline">
      <div className="ph">
        {/* Real cover from the trip's top-voted home; editorial Unsplash as fallback for new trips. */}
        <SafeImg src={trip.coverPhoto || photoFor(i)} alt="" />
        <div className="scrim" />
        <span className="dest"><Icon icon={MapPin} className="ico" /> {trip.destination || 'Trip'}</span>
        {trip.isOwner && (
          <span className="crown"><Icon icon={Crown} className="ico" /> Organizer</span>
        )}
      </div>
      <div className="bd">
        <div className="nm">{trip.name}</div>
        <div className="meta">
          {range && (
            <span className="it"><Icon icon={Calendar} className="ico" /> <span className="tnum">{range}</span></span>
          )}
          <span className="it">
            <Avatars count={trip.memberCount} /> {trip.memberCount} member{trip.memberCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="foot">
          <span className="open">Open board <Icon icon={ArrowRight} className="ico" /></span>
        </div>
      </div>
    </Link>
  );
}

export function TripsView() {
  const { user, myTrips, accountLoading, refreshMyTrips, openAuth } = useApp();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (user) void refreshMyTrips();
  }, [user, refreshMyTrips]);

  useEffect(() => {
    if (!accountLoading && !user) openAuth('see your trips');
  }, [accountLoading, user, openAuth]);

  if (accountLoading) {
    return <div className="py-24 text-center text-text-muted">Loading…</div>;
  }
  if (!user) return <Navigate to="/" replace />;

  if (isMobile) return <MobileTrips />;

  const count = myTrips.length;

  return (
    <div className="tp-main">
      <div className="tp-wrap">
        <div className="trips-head">
          <div className="l">
            <h1>Your trips</h1>
            <p>
              {count === 0
                ? 'No boards yet — start one and invite your group.'
                : <>{count} active board{count === 1 ? '' : 's'} — <b>pick up where your group left off.</b></>}
            </p>
          </div>
          {count > 0 && (
            <Button variant="primary" className="new-btn" onClick={() => navigate('/trips/new')}>
              <Plus className="h-[18px] w-[18px]" /> New trip
            </Button>
          )}
        </div>

        {count === 0 ? (
          <div className="trips-empty">
            <div className="editorial">
              <div className="bg" style={{ backgroundImage: `url(${photoFor(0)})` }} />
              <div className="paper">
                <span className="ec-icon"><Icon icon={Plus} size="lg" className="ico" /></span>
                <h3>Create your first trip</h3>
                <p>Spin up a shared board, invite your group, and start collecting homes everyone can vote on.</p>
                <button className="btn btn-primary" onClick={() => navigate('/trips/new')}>
                  <Plus className="h-[18px] w-[18px]" /> Create your first trip
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="trips-grid">
            {myTrips.map((t, i) => <TripCard key={t.id} trip={t} i={i} />)}
            <button className="trip-new" onClick={() => navigate('/trips/new')}>
              <span className="ic"><Icon icon={Plus} className="ico" /></span>
              <span className="t">New trip</span>
              <span className="s">Start a fresh board</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

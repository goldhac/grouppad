import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun, Crown, MapPin, Calendar, Home, ArrowRight, Image as ImageIcon, Plus, LayoutGrid, User, Check, LogOut, X, DoorOpen } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { SafeImg } from '@/components/ui/SafeImg';
import type { TripView } from '@/types';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtRange(a?: string | null, b?: string | null): string | null {
  if (!a) return null;
  const [ya, ma, da] = a.split('-').map(Number);
  if (!ma) return null;
  const start = `${MON[ma - 1]} ${da}`;
  if (!b) return `${start}, ${ya}`;
  const [yb, mb, db] = b.split('-').map(Number);
  return `${start} – ${ma === mb ? db : `${MON[mb - 1]} ${db}`}, ${yb || ya}`;
}
const PHOTOS = ['1564013799919-ab600027ffc6', '1600585154340-be6161a56a0c', '1600566753086-00f18fb6b3ea', '1600047509807-ba8f99d2cdde', '1512917774080-9991f1c4c750', '1600585152220-90363fe7e115'];
const photoFor = (i: number) => `https://images.unsplash.com/photo-${PHOTOS[i % PHOTOS.length]}?w=760&q=80&auto=format&fit=crop`;
const AV = ['var(--accent)', 'var(--c-indigo-600)', 'var(--c-cyan-600)'];

function Avatars({ count }: { count: number }) {
  const shown = Math.min(Math.max(count, 1), 3);
  return (
    <span className="avs" aria-hidden>
      {Array.from({ length: shown }).map((_, i) => <span key={i} className="av" style={{ background: AV[i % AV.length] }} />)}
      {count > 3 && <span className="av more">+{count - 3}</span>}
    </span>
  );
}

export function MobileTrips() {
  const { myTrips, user, signOut, leaveTrip, openAuth } = useApp();
  const navigate = useNavigate();
  const [seg, setSeg] = useState<'upcoming' | 'past'>('upcoming');
  const [acctOpen, setAcctOpen] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('gp_theme', next); } catch { /* ignore */ }
    setTheme(next);
  };

  const card = (t: TripView, i: number) => (
    <article key={t.id} className="tcard" onClick={() => navigate(`/t/${t.id}/board`)} role="button" tabIndex={0}>
      <div className="tph">
        <div className="fb"><Icon icon={ImageIcon} className="ico" /></div>
        <SafeImg src={t.coverPhoto || photoFor(i)} alt="" />
        <div className="scrim" />
        {t.isOwner && <span className="crown"><Icon icon={Crown} className="ico" /> Organizer</span>}
        <span className="status active"><span className="dot" /> Active</span>
        <span className="dest"><Icon icon={MapPin} className="ico" /> {t.destination || 'Trip'}</span>
      </div>
      <div className="tbd">
        <div className="tnm">{t.name}</div>
        <div className="tmeta">
          {fmtRange(t.checkin, t.checkout_5n) && <span className="it"><Icon icon={Calendar} className="ico" /> <span className="hl tnum">{fmtRange(t.checkin, t.checkout_5n)}</span></span>}
          <span className="it"><Avatars count={t.memberCount || 1} /> {t.memberCount || 1} member{(t.memberCount || 1) === 1 ? '' : 's'}</span>
        </div>
        <div className="tfoot"><span className="homes"><Icon icon={Home} className="ico" /> Group board</span><span className="open">Open board <Icon icon={ArrowRight} className="ico" /></span></div>
      </div>
    </article>
  );

  return (
    <div className="gp-mobile">
      <div className="mb">
        <div className="mb-top">
          <div className="acct-bar">
            <span className="brand">
              <svg className="mk" width="28" height="28" viewBox="0 0 56 56"><rect width="56" height="56" rx="16" fill="var(--accent)" /><path d="M14 31 L28 17 L42 31" fill="none" stroke="var(--accent-fg)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M18 29 V41 H38 V29" fill="none" stroke="var(--accent-fg)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" /><circle cx="28" cy="35" r="3.4" fill="var(--gold-dot)" /></svg>
              GroupPad
            </span>
            <span className="spacer" />
            <button className="iconbtn" onClick={toggleTheme} aria-label="Theme"><Icon icon={theme === 'dark' ? Sun : Moon} className="ico" /></button>
            <button className="iconbtn acct" aria-label="Account" onClick={() => setAcctOpen(true)}><span className="av">{(user?.name || 'G').slice(0, 1).toUpperCase()}</span></button>
          </div>
        </div>

        <div className="mb-scroll" style={{ paddingBottom: 104 }}>
          <div className="tp-title">
            <h1>Your trips</h1>
            <p>{myTrips.length ? <><b>{myTrips.length} active board{myTrips.length === 1 ? '' : 's'}</b>. Pick up where your group left off.</> : 'No boards yet. Start one and invite your group.'}</p>
          </div>
          {myTrips.length > 0 && (
            <div className="tp-seg">
              <button className={seg === 'upcoming' ? 'on' : ''} onClick={() => setSeg('upcoming')}>Upcoming</button>
              <button className={seg === 'past' ? 'on' : ''} onClick={() => setSeg('past')}>Past</button>
            </div>
          )}
          {seg === 'past' ? (
            <div className="tp-empty" style={{ paddingTop: 40 }}><div style={{ textAlign: 'center', color: 'var(--text-muted)' }}><Icon icon={Check} className="ico" /><div style={{ marginTop: 10, fontSize: 14 }}>No past trips yet.</div></div></div>
          ) : myTrips.length ? (
            <div className="tp-list">
              {myTrips.map((t, i) => card(t, i))}
              <div className="tnew" onClick={() => navigate('/trips/new')} role="button" tabIndex={0}><span className="ic"><Icon icon={Plus} className="ico" /></span><span className="t">New trip</span><span className="s">Start planning a group stay</span></div>
            </div>
          ) : (
            <div className="tp-empty"><div className="card-empty"><div className="paper">
              <span className="ec-icon"><Icon icon={Plus} className="ico" /></span>
              <h3>Create your first trip</h3>
              <p>Spin up a shared board, invite your group, and start collecting homes everyone can vote on.</p>
              <button className="btn btn-primary btn-lg" onClick={() => navigate('/trips/new')}><Icon icon={Plus} className="ico" /> Create your first trip</button>
            </div></div></div>
          )}
        </div>

        <div className="mb-nav">
          <div className="nav-item on"><Icon icon={LayoutGrid} className="ico" /><span className="lab">Trips</span></div>
          <div className="nav-add" onClick={() => navigate('/trips/new')}><div className="fab"><Icon icon={Plus} className="ico" /></div><div className="lab">Create</div></div>
          <div className="nav-item" onClick={() => setAcctOpen(true)} role="button" tabIndex={0}><Icon icon={User} className="ico" /><span className="lab">Account</span></div>
        </div>

        {acctOpen && (
          <div className="acct-sheet-wrap" onClick={() => setAcctOpen(false)}>
            <div className="acct-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Account">
              <div className="ash-grab" />
              <button className="ash-x" aria-label="Close" onClick={() => setAcctOpen(false)}><Icon icon={X} className="ico" /></button>
              <div className="ash-id">
                <span className="ash-av">{(user?.name || 'G').slice(0, 1).toUpperCase()}</span>
                <div className="ash-meta">
                  <div className="ash-name">{user?.name || 'Guest'}</div>
                  {user?.email && <div className="ash-email">{user.email}</div>}
                </div>
              </div>

              {myTrips.length > 0 && (
                <div className="ash-trips">
                  <div className="ash-lbl">Your trips</div>
                  {myTrips.map((t) => (
                    <div className="ash-trip" key={t.id}>
                      <span className="ash-trip-name">{t.name || t.destination || 'Trip'}</span>
                      {t.isOwner
                        ? <span className="ash-owner"><Icon icon={Crown} className="ico" /> Organizer</span>
                        : <button className="ash-leave" onClick={() => { if (confirm('Leave this trip? You can rejoin with the invite link.')) leaveTrip(t.id); }}><Icon icon={DoorOpen} className="ico" /> Leave</button>}
                    </div>
                  ))}
                </div>
              )}

              {user
                ? <button className="ash-signout" onClick={async () => { await signOut(); setAcctOpen(false); }}><Icon icon={LogOut} className="ico" /> Sign out</button>
                : <button className="ash-signin" onClick={() => { setAcctOpen(false); openAuth('sign in'); }}><Icon icon={User} className="ico" /> Sign in</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

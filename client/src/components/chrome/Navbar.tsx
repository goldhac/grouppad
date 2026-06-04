import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ChevronDown, Plus, LogOut, LayoutGrid, Check, Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { NotifPrefs } from '@/types';

/** A single labelled checkbox row for the notifications modal. */
function Toggle({ label, desc, checked, disabled, onChange }: {
  label: string; desc: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-accent"
      />
      <span>
        <span className="block text-sm font-medium text-text">{label}</span>
        <span className="block text-xs text-muted">{desc}</span>
      </span>
    </label>
  );
}

/** Per-user email notification preferences. Loads on open; saves on each toggle. */
function NotifModal({ onClose }: { onClose: () => void }) {
  const { toast } = useApp();
  const [prefs, setPrefs] = useState<NotifPrefs | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.notifPrefs().then(setPrefs).catch(() => setPrefs({ digest: true, instant: true }));
  }, []);

  async function update(patch: Partial<NotifPrefs>) {
    if (!prefs) return;
    const prev = prefs;
    setPrefs({ ...prefs, ...patch });
    setBusy(true);
    try {
      setPrefs(await api.setNotifPrefs(patch));
    } catch {
      setPrefs(prev);
      toast('Could not save preferences.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Email notifications</h2>
        <p className="mt-1 text-sm text-muted">Choose what GroupPad emails you about your trips.</p>
        <div className="mt-4 space-y-3">
          <Toggle
            label="Daily recap"
            desc="One summary a day of new homes, votes, and comments."
            checked={!!prefs?.digest}
            disabled={!prefs || busy}
            onChange={(v) => void update({ digest: v })}
          />
          <Toggle
            label="Big moments"
            desc="Instant alert when the final pick is locked, or someone joins your trip."
            checked={!!prefs?.instant}
            disabled={!prefs || busy}
            onChange={(v) => void update({ instant: v })}
          />
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

/** Minimal click-away dropdown. */
function Menu({ label, children }: { label: React.ReactNode; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-text hover:bg-panel-2"
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5 text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-border bg-panel p-1 shadow-xl">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-text hover:bg-panel-2"
    >
      {children}
    </button>
  );
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
    isActive ? 'bg-panel-2 text-text' : 'text-muted hover:text-text',
  );

export function Navbar() {
  const { user, myTrips, trip, isOwner, signOut, openAuth } = useApp();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-panel/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:px-6">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2 font-bold tracking-tight hover:no-underline">
          <span className="text-xl">🏡</span>
          <span className="text-[15px]">GroupPad</span>
        </Link>

        {/* Trip switcher (when a trip is active) */}
        {trip && (
          <>
            <span className="text-border">/</span>
            <Menu label={<span className="max-w-[160px] truncate font-medium">{trip.name}</span>}>
              {(close) => (
                <>
                  {myTrips.map((t) => (
                    <MenuItem
                      key={t.id}
                      onClick={() => {
                        close();
                        navigate(`/t/${t.id}/board`);
                      }}
                    >
                      <span className="flex-1 truncate">{t.name}</span>
                      {t.id === trip.id && <Check className="h-4 w-4 text-accent" />}
                    </MenuItem>
                  ))}
                  <div className="my-1 h-px bg-border" />
                  <MenuItem onClick={() => { close(); navigate('/trips'); }}>
                    <LayoutGrid className="h-4 w-4" /> All trips
                  </MenuItem>
                  <MenuItem onClick={() => { close(); navigate('/trips/new'); }}>
                    <Plus className="h-4 w-4" /> New trip
                  </MenuItem>
                </>
              )}
            </Menu>
          </>
        )}

        {/* Contextual nav */}
        <nav className="ml-2 hidden items-center gap-1 sm:flex">
          {trip ? (
            <>
              <NavLink to={`/t/${trip.id}/board`} className={navLinkClass}>Board</NavLink>
              <NavLink to={`/t/${trip.id}/help`} className={navLinkClass}>How it works</NavLink>
              {isOwner && <NavLink to={`/t/${trip.id}/manage`} className={navLinkClass}>Manage</NavLink>}
            </>
          ) : (
            user && <NavLink to="/trips" className={navLinkClass}>Your trips</NavLink>
          )}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Button variant="primary" size="sm" onClick={() => navigate('/trips/new')}>
                <Plus className="h-4 w-4" /> New trip
              </Button>
              <Menu label={<span className="max-w-[120px] truncate">{user.name}</span>}>
                {(close) => (
                  <>
                    <MenuItem onClick={() => { close(); navigate('/trips'); }}>
                      <LayoutGrid className="h-4 w-4" /> Your trips
                    </MenuItem>
                    <MenuItem onClick={() => { close(); setNotifOpen(true); }}>
                      <Bell className="h-4 w-4" /> Email notifications
                    </MenuItem>
                    <div className="my-1 h-px bg-border" />
                    <MenuItem onClick={() => { close(); void signOut(); navigate('/'); }}>
                      <LogOut className="h-4 w-4" /> Sign out
                    </MenuItem>
                  </>
                )}
              </Menu>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => openAuth()}>Sign in</Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => { window.location.href = api.googleSignInUrl; }}
              >
                Get started
              </Button>
            </>
          )}
        </div>
      </div>
      {notifOpen && <NotifModal onClose={() => setNotifOpen(false)} />}
    </header>
  );
}

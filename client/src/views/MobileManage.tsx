import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Moon, Sun, Settings, MapPin, Calendar, Users, Activity, Home, ThumbsUp, Star,
  Link2, Copy, Check, ShieldCheck, ShieldOff, UserPlus, Send, SlidersHorizontal, ChevronDown, Crown,
  UserMinus, AlertTriangle, LockOpen, Square, Trash2, Palette,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { SkinPicker } from '@/components/ui/SkinPicker';
import type { SkinId } from '@/lib/skins';
import { cn } from '@/lib/cn';
import type { TripMember, TripPulse } from '@/types';

type ConfirmKind = 'reset' | 'close' | 'transfer' | 'promote' | 'demote' | 'remove' | 'delete';
const CONFIRMS: Record<ConfirmKind, { glyph: typeof Crown; tone: string; title: string; sub: string; cta: string; btn: string; typed?: boolean }> = {
  reset: { glyph: LockOpen, tone: 'gold', title: 'Reset the official pick?', sub: 'The group can keep deciding. All votes are kept.', cta: 'Reset pick', btn: 'btn-primary' },
  close: { glyph: Square, tone: 'warn', title: 'Close voting for everyone?', sub: 'Likes and top-choices freeze. You can reopen voting anytime.', cta: 'Close voting', btn: 'btn-primary' },
  transfer: { glyph: Crown, tone: 'gold', title: 'Make them the trip creator?', sub: 'They take over as creator and can delete the trip. You stay on as an organizer.', cta: 'Transfer', btn: 'btn-primary' },
  promote: { glyph: UserPlus, tone: 'gold', title: 'Make this member an organizer?', sub: 'Organizers manage the board, lock the pick, invite people, and promote others. They cannot delete the trip.', cta: 'Make organizer', btn: 'btn-primary' },
  demote: { glyph: ShieldOff, tone: 'warn', title: 'Remove organizer role?', sub: 'They go back to being a regular member and keep their votes.', cta: 'Remove role', btn: 'btn-primary' },
  remove: { glyph: UserMinus, tone: 'danger', title: 'Remove this member?', sub: 'They lose access to the board. They can rejoin with the invite link.', cta: 'Remove', btn: 'btn-dz' },
  delete: { glyph: Trash2, tone: 'danger', title: 'Delete this trip?', sub: "This removes the board, listings, votes, and everything else for everyone. It can't be undone.", cta: 'Delete trip', btn: 'btn-dz', typed: true },
};

export function MobileManage() {
  const { trip, deleteTrip, enterTrip, setDecision, setTripSkin, toast } = useApp();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');
  const [members, setMembers] = useState<TripMember[]>([]);
  const [pulse, setPulse] = useState<TripPulse | null>(null);
  const [copied, setCopied] = useState(false);
  const [emails, setEmails] = useState('');
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; member?: TripMember } | null>(null);
  const [delText, setDelText] = useState('');
  const [form, setForm] = useState({ name: '', destination: '', checkin: '', checkout_5n: '', adults: '', budget: '', home_type: 'Any' });
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!trip) return;
    if (loadedFor.current !== trip.id) {
      loadedFor.current = trip.id;
      setForm({ name: trip.name, destination: trip.destination || '', checkin: trip.checkin || '', checkout_5n: trip.checkout_5n || '', adults: String(trip.adults || ''), budget: String(trip.budget || ''), home_type: trip.home_type || 'Any' });
      api.tripPulse(trip.id).then(setPulse).catch(() => {});
      api.members(trip.id).then((r) => setMembers(r.members)).catch(() => {});
    }
  }, [trip]);

  if (!trip) return <div className="gp-mobile" />;

  const toggleTheme = () => { const next = theme === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', next); try { localStorage.setItem('gp_theme', next); } catch { /**/ } setTheme(next); };
  const link = `${location.origin}/s/i/${trip.id}${trip.join_code ? `?c=${trip.join_code}` : ''}`;
  const joined = members.length || trip.memberCount;
  const guests = trip.adults || joined;
  const pct = Math.min(100, Math.round(((pulse?.picks || 0) / Math.max(1, guests)) * 100));

  const copyLink = () => { try { navigator.clipboard?.writeText(link); } catch { /**/ } setCopied(true); toast('Invite link copied.', 'success'); setTimeout(() => setCopied(false), 1800); };
  const sendInvites = async () => { if (!emails.trim()) return toast('Add an email address first.', 'error'); try { const r = await api.invite(trip.id, emails.trim()); toast(`Invite sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}.`, 'success'); setEmails(''); } catch (e) { toast(e instanceof Error ? e.message : 'Could not send invites.', 'error'); } };
  const saveSettings = async () => {
    if (!form.name.trim() || !form.destination.trim() || !form.checkin || !form.checkout_5n || form.checkout_5n <= form.checkin || Number(form.adults) < 2 || Number(form.budget) <= 0) return toast('Check the highlighted fields.', 'error');
    try { await api.patchTrip(trip.id, { name: form.name.trim(), destination: form.destination.trim(), checkin: form.checkin, checkout_5n: form.checkout_5n, adults: Number(form.adults), budget: Number(form.budget), home_type: form.home_type }); await enterTrip(trip.id, true); toast('Trip settings saved.', 'success'); } catch (e) { toast(e instanceof Error ? e.message : 'Could not save.', 'error'); }
  };
  const run = async () => {
    const c = confirm; if (!c) return;
    if (c.kind === 'delete' && delText.trim().toUpperCase() !== 'DELETE') return;
    setConfirm(null); setDelText('');
    try {
      if (c.kind === 'reset') { await setDecision(null); toast('Official pick reset.', 'success'); api.tripPulse(trip.id).then(setPulse).catch(() => {}); }
      else if (c.kind === 'close') { const next = !trip.voting_closed; await api.patchTrip(trip.id, { voting_closed: next }); await enterTrip(trip.id, true); toast(next ? 'Voting closed.' : 'Voting reopened.', 'success'); }
      else if (c.kind === 'transfer' && c.member) { await api.transferOrganizer(trip.id, c.member.id); toast(`${c.member.name} is now the trip creator.`, 'success'); await enterTrip(trip.id, true); navigate(`/t/${trip.id}/board`); }
      else if (c.kind === 'promote' && c.member) { await api.makeOrganizer(trip.id, c.member.id); setMembers((m) => m.map((x) => x.id === c.member!.id ? { ...x, role: 'organizer' } : x)); toast(`${c.member.name} is now an organizer.`, 'success'); }
      else if (c.kind === 'demote' && c.member) { await api.removeOrganizer(trip.id, c.member.id); setMembers((m) => m.map((x) => x.id === c.member!.id ? { ...x, role: 'member' } : x)); toast(`${c.member.name} is a member again.`, 'success'); }
      else if (c.kind === 'remove' && c.member) { await api.removeMember(trip.id, c.member.id); setMembers((m) => m.filter((x) => x.id !== c.member!.id)); toast('Member removed.', 'success'); }
      else if (c.kind === 'delete') { await deleteTrip(trip.id); toast('Trip deleted.', 'success'); navigate('/trips'); }
    } catch (e) { toast(e instanceof Error ? e.message : 'Something went wrong.', 'error'); }
  };

  const sf = (k: keyof typeof form, label: string, opts: { full?: boolean; type?: string; min?: number; prefix?: boolean; select?: string[] } = {}) => (
    <div className={cn('set-field', opts.full && 'full')} data-f={k}>
      <label>{label}</label>
      {opts.select ? (
        <div className="sel"><select className="field" value={form[k]} onChange={(e) => setForm((s) => ({ ...s, [k]: e.target.value }))}>{opts.select.map((o) => <option key={o}>{o}</option>)}</select><Icon icon={ChevronDown} className="ico chev" /></div>
      ) : opts.prefix ? (
        <div className="prefix"><span className="sign">$</span><input className="field" type="number" value={form[k]} onChange={(e) => setForm((s) => ({ ...s, [k]: e.target.value }))} /></div>
      ) : (
        <input className="field" type={opts.type || 'text'} min={opts.min} value={form[k]} onChange={(e) => setForm((s) => ({ ...s, [k]: e.target.value }))} />
      )}
    </div>
  );

  return (
    <div className="gp-mobile">
      <div className="mb">
        <div className="mb-top"><div className="pg-top"><div className="row">
          <span className="pg-back" onClick={() => navigate(`/t/${trip.id}/board`)}><Icon icon={ArrowLeft} className="ico" /> Board</span>
          <span className="ttl">Manage</span><span className="spacer" />
          <button className="iconbtn" onClick={toggleTheme} aria-label="Theme"><Icon icon={theme === 'dark' ? Sun : Moon} className="ico" /></button>
        </div></div></div>

        <div className="mb-scroll" style={{ paddingBottom: 32 }}>
          <div className="mg">
            <div className="mg-head"><div className="ey"><Icon icon={Settings} className="ico" /> Manage trip</div><h1>{trip.name}</h1>
              <div className="meta"><span className="it"><Icon icon={MapPin} className="ico" /> <span className="hl">{trip.destination}</span></span><span className="it"><Icon icon={Calendar} className="ico" /> <span className="hl tnum">{trip.checkin}</span></span><span className="it"><Icon icon={Users} className="ico" /> <span className="hl">{guests} guests</span></span></div></div>

            <div className="mg-card mg-pulse">
              <div className="c-h"><Icon icon={Activity} className="ico" /><h2>Group pulse</h2></div>
              <div className="ptop"><span><Icon icon={Users} className="ico" /> Top-choice votes in</span><b className="tnum">{pulse?.picks || 0} of {guests}</b></div>
              <div className="ptrack"><div className="pfill" style={{ width: `${pct}%` }} /></div>
              <div className="pulse-stats">
                <div className="pstat"><Icon icon={Users} className="ico" /><div className="v tnum">{pulse?.members ?? joined}</div><div className="l">Members</div></div>
                <div className="pstat"><Icon icon={Home} className="ico" /><div className="v tnum">{pulse?.listings ?? 0}</div><div className="l">Homes added</div></div>
                <div className="pstat"><Icon icon={ThumbsUp} className="ico" /><div className="v tnum">{pulse?.votes ?? 0}</div><div className="l">Votes cast</div></div>
                <div className="pstat"><Icon icon={Star} className="ico" /><div className="v tnum">{pulse?.picks ?? 0}</div><div className="l">Top picks</div></div>
              </div>
              <div className="decision-status">{trip.voting_closed ? 'Voting is closed.' : "No official pick yet. Lock one from the board when the group's ready."}</div>
            </div>

            <div className="mg-card">
              <div className="c-h"><Icon icon={Link2} className="ico" /><h2>Invite your group</h2></div>
              <p className="c-sub">Anyone with this link can view the board. They sign in to vote, add homes, or comment.</p>
              <div className="invite-row">
                <div className="linkbox"><Icon icon={Link2} className="ico" /><input readOnly value={link} /></div>
                <button className="btn btn-primary" onClick={copyLink}><Icon icon={copied ? Check : Copy} className="ico" /> {copied ? 'Copied' : 'Copy link'}</button>
              </div>
              <div className="invite-foot"><Icon icon={ShieldCheck} className="ico" /> Only people you share the link with can find this trip.</div>
              <div className="invite-email">
                <div className="lab"><Icon icon={Palette} className="ico" /> Trip theme</div>
                <div className="sub">Sets the board's look for the whole group. Members can override it for themselves.</div>
                <div style={{ marginTop: 8 }}><SkinPicker value={(trip.skin as SkinId) || 'classic'} onChange={(s) => { if (s) void setTripSkin(s).then(() => toast('Trip theme updated.', 'success')).catch(() => toast('Could not update theme.', 'error')); }} /></div>
              </div>
              <div className="invite-email">
                <div className="lab">Or invite by email</div>
                <div className="sub">We'll email each person a one-tap link to join. Separate addresses with commas.</div>
                <div className="row"><input className="field" placeholder="alex@email.com, sam@email.com" value={emails} onChange={(e) => setEmails(e.target.value)} /><button className="btn btn-ghost" onClick={() => void sendInvites()}><Icon icon={Send} className="ico" /> Send invites</button></div>
              </div>
            </div>

            <div className="mg-card">
              <div className="c-h"><Icon icon={Users} className="ico" /><h2>Members</h2><span className="spacer" /><span className="role-badge mem">{joined} joined</span></div>
              <div className="member-list">
                {members.map((m) => (
                  <div className="member-row" key={m.id}>
                    <span className="av" style={m.avatar ? undefined : { background: 'var(--accent)' }}>{(m.name || '?').slice(0, 1).toUpperCase()}</span>
                    <div className="who"><div className="nm">{m.name} {m.isCreator ? <span className="role-badge org"><Icon icon={Crown} className="ico" /> Creator</span> : m.role === 'organizer' ? <span className="role-badge org"><Icon icon={ShieldCheck} className="ico" /> Organizer</span> : <span className="role-badge mem">Member</span>}</div><div className="em">{m.email}</div></div>
                    <div className="m-actions">
                      {!m.isYou && !m.isCreator && m.role === 'member' && <button className="icon-btn gold" onClick={() => setConfirm({ kind: 'promote', member: m })} aria-label="Make organizer"><Icon icon={UserPlus} className="ico" /></button>}
                      {trip.isCreator && !m.isYou && !m.isCreator && m.role === 'organizer' && <button className="icon-btn" onClick={() => setConfirm({ kind: 'demote', member: m })} aria-label="Remove organizer role"><Icon icon={ShieldOff} className="ico" /></button>}
                      {trip.isCreator && !m.isYou && !m.isCreator && m.role === 'member' && <button className="icon-btn gold" onClick={() => setConfirm({ kind: 'transfer', member: m })} aria-label="Make creator"><Icon icon={Crown} className="ico" /></button>}
                      {trip.isCreator && !m.isYou && !m.isCreator && <button className="icon-btn danger" onClick={() => setConfirm({ kind: 'remove', member: m })} aria-label="Remove"><Icon icon={UserMinus} className="ico" /></button>}
                      {m.isYou && m.role === 'organizer' && !m.isCreator && <button className="icon-btn" onClick={() => setConfirm({ kind: 'demote', member: m })} aria-label="Step down"><Icon icon={ShieldOff} className="ico" /></button>}
                      {m.isYou && !(m.role === 'organizer' && !m.isCreator) && <span className="you-tag">You</span>}
                    </div>
                  </div>
                ))}
                {members.length === 0 && <p style={{ padding: '10px 0', fontSize: 13.5, color: 'var(--text-muted)' }}>Just you so far. Share the invite link to bring your group in.</p>}
              </div>
            </div>

            <div className="mg-card">
              <div className="c-h"><Icon icon={SlidersHorizontal} className="ico" /><h2>Trip settings</h2></div>
              <p className="c-sub">Changing dates or destination updates what the search looks for. Members keep their votes.</p>
              <div className="set-grid">
                {sf('name', 'Trip name', { full: true })}
                {sf('destination', 'Destination', { full: true })}
                {sf('checkin', 'Check-in', { type: 'date' })}
                {sf('checkout_5n', 'Check-out', { type: 'date' })}
                {sf('adults', 'Guests', { type: 'number', min: 2 })}
                {sf('budget', 'Budget · all-in', { prefix: true })}
                {sf('home_type', 'Home type', { select: ['Any', 'House', 'Apartment', 'Villa', 'Cabin'], full: true })}
              </div>
              <div className="set-foot"><button className="btn btn-primary" onClick={() => void saveSettings()}><Icon icon={Check} className="ico" /> Save changes</button></div>
            </div>
          </div>

          <div className="danger-zone">
            <div className="dz-h"><Icon icon={AlertTriangle} className="ico" /><h2>Danger zone</h2></div>
            <div className="dz-row"><div className="dz-info"><div className="t">Reset the official pick</div><div className="s">Unlocks the current pick so the group can keep deciding. Votes are kept.</div></div>
              <button className="btn btn-dz-soft" onClick={() => setConfirm({ kind: 'reset' })}><Icon icon={LockOpen} className="ico" /> Reset pick</button></div>
            <div className="dz-row"><div className="dz-info"><div className="t">{trip.voting_closed ? 'Reopen voting' : 'Close voting'}</div><div className="s">Freezes likes and top-choices. Members can still view the board.</div></div>
              <button className="btn btn-dz-soft" onClick={() => setConfirm({ kind: 'close' })}><Icon icon={Square} className="ico" /> {trip.voting_closed ? 'Reopen voting' : 'Close voting'}</button></div>
            <div className="dz-row"><div className="dz-info"><div className="t">Delete this trip</div><div className="s">Removes the board, listings, votes, and everything else for all {joined} members. This cannot be undone.</div></div>
              <button className="btn btn-dz" onClick={() => setConfirm({ kind: 'delete' })}><Icon icon={Trash2} className="ico" /> Delete trip</button></div>
          </div>
        </div>

        {confirm && (() => {
          const c = CONFIRMS[confirm.kind];
          return (
            <>
              <div className="scrim show" onClick={() => { setConfirm(null); setDelText(''); }} />
              <div className="sheet show"><div className="grab" />
                <div className="confirm-body">
                  <div className="c-top"><div className={`c-icon ${c.tone}`}><Icon icon={c.glyph} className="ico" /></div><div><h3>{c.title}</h3><p className="sub">{confirm.member ? `${confirm.member.name} · ${c.sub}` : c.sub}</p></div></div>
                  {c.typed ? (
                    <div style={{ margin: '6px 0 16px' }}><div className="type-lab">Type <b>DELETE</b> to confirm.</div><input className="field" placeholder="DELETE" autoComplete="off" value={delText} onChange={(e) => setDelText(e.target.value)} /></div>
                  ) : <div style={{ height: 8 }} />}
                  <div className="sh-foot"><button className="btn btn-ghost" onClick={() => { setConfirm(null); setDelText(''); }}>Cancel</button><button className={cn('btn', c.btn, c.typed && delText.trim().toUpperCase() !== 'DELETE' && 'is-disabled')} onClick={() => void run()}>{c.cta}</button></div>
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

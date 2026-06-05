import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Settings, MapPin, Calendar, Users, LayoutGrid, Link2, Copy, Check, Send, ShieldCheck,
  SlidersHorizontal, ChevronDown, AlertCircle, CheckCircle2, Crown, UserMinus, Activity, Home,
  ThumbsUp, Star, Info, AlertTriangle, LockOpen, Square, Trash2, BadgeCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import type { TripPulse, TripMember } from '@/types';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtRange(a?: string | null, b?: string | null) {
  if (!a) return '';
  const [ya, ma, da] = a.split('-').map(Number);
  if (!ma) return '';
  const s = `${MON[ma - 1]} ${da}`;
  if (!b) return `${s}, ${ya}`;
  const [yb, mb, db] = b.split('-').map(Number);
  return `${s} – ${ma === mb ? db : `${MON[mb - 1]} ${db}`}, ${yb || ya}`;
}
function initials(name?: string) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || name[0].toUpperCase();
}

type ConfirmKind = 'reset' | 'close' | 'transfer' | 'remove' | 'delete';
interface ConfirmState { kind: ConfirmKind; member?: TripMember; }

export function ManageView() {
  const { trip, isOwner, deleteTrip, enterTrip, setDecision, toast } = useApp();
  const navigate = useNavigate();
  const [pulse, setPulse] = useState<TripPulse | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [copied, setCopied] = useState(false);
  const [emails, setEmails] = useState('');
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const [form, setForm] = useState({ name: '', destination: '', checkin: '', checkout_5n: '', adults: '2', budget: '0', home_type: 'Any' });
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);
  const [savingSet, setSavingSet] = useState(false);

  const resetForm = useMemo(() => () => {
    if (!trip) return;
    setForm({
      name: trip.name ?? '', destination: trip.destination ?? '', checkin: trip.checkin ?? '',
      checkout_5n: trip.checkout_5n ?? '', adults: String(trip.adults ?? 2), budget: String(trip.budget ?? 0),
      home_type: trip.home_type ?? 'Any',
    });
    setInvalid(new Set());
  }, [trip]);

  useEffect(() => { resetForm(); }, [resetForm]);
  useEffect(() => {
    if (trip && isOwner) {
      api.tripPulse(trip.id).then(setPulse).catch(() => {});
      api.members(trip.id).then((r) => setMembers(r.members)).catch(() => {});
    }
  }, [trip, isOwner]);

  if (!trip) return null;
  if (!isOwner) {
    return (
      <main className="mg-main"><div className="tp-wrap">
        <div className="mx-auto max-w-lg py-20 text-center">
          <p className="font-display text-xl font-semibold">Organizer only</p>
          <p className="mt-2 text-sm text-text-muted">Only the trip organizer can manage this trip.</p>
          <Link to={`/t/${trip.id}/board`} className="btn btn-primary mt-5 inline-flex">Back to the board</Link>
        </div>
      </div></main>
    );
  }

  const joinedCount = members.length || trip.memberCount;
  const inviteLink = `${window.location.origin}/#/t/${trip.id}/board${trip.join_code ? `?join=${trip.join_code}` : ''}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(inviteLink); setCopied(true); toast('Invite link copied.', 'success'); window.setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  };
  const sendInvites = async () => {
    if (!emails.trim()) return;
    setSending(true);
    try {
      const r = await api.invite(trip.id, emails.trim());
      if (r.sent) { toast(`Invite sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}.`, 'success'); setEmails(''); }
      else toast('No valid email addresses found.', 'error');
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not send invites.', 'error'); }
    finally { setSending(false); }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  function validateSettings(): boolean {
    const bad = new Set<string>();
    if (!form.name.trim()) bad.add('name');
    if (!form.destination.trim()) bad.add('destination');
    if (!form.checkin) bad.add('checkin');
    if (!form.checkout_5n || form.checkout_5n <= form.checkin) bad.add('checkout_5n');
    if (!form.adults || Number(form.adults) < 2) bad.add('adults');
    if (!form.budget || Number(form.budget) <= 0) bad.add('budget');
    setInvalid(bad);
    return bad.size === 0;
  }
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!validateSettings()) return;
    setSavingSet(true);
    try {
      await api.patchTrip(trip!.id, {
        name: form.name.trim(), destination: form.destination.trim(), checkin: form.checkin,
        checkout_5n: form.checkout_5n, adults: Number(form.adults), budget: Number(form.budget), home_type: form.home_type,
      });
      await enterTrip(trip!.id);
      setSaved(true); toast('Trip settings saved.', 'success');
      window.setTimeout(() => navigate(`/t/${trip!.id}/board`), 700);
    } catch (err) { toast(err instanceof Error ? err.message : 'Could not save settings.', 'error'); setSavingSet(false); }
  }

  async function runConfirm(typedOk: boolean) {
    if (!confirm) return;
    const c = confirm;
    setConfirm(null);
    try {
      if (c.kind === 'reset') { await setDecision(null); toast('Official pick reset — the group can keep deciding.', 'success'); api.tripPulse(trip!.id).then(setPulse).catch(() => {}); }
      else if (c.kind === 'close') { const next = !trip!.voting_closed; await api.patchTrip(trip!.id, { voting_closed: next }); await enterTrip(trip!.id); toast(next ? 'Voting closed. Reopen it whenever you like.' : 'Voting reopened.', 'success'); }
      else if (c.kind === 'transfer' && c.member) { await api.transferOrganizer(trip!.id, c.member.id); toast(`${c.member.name} is now the organizer.`, 'success'); await enterTrip(trip!.id); navigate(`/t/${trip!.id}/board`); }
      else if (c.kind === 'remove' && c.member) { await api.removeMember(trip!.id, c.member.id); setMembers((m) => m.filter((x) => x.id !== c.member!.id)); toast('Member removed from the trip.', 'success'); }
      else if (c.kind === 'delete' && typedOk) { await deleteTrip(trip!.id); toast('Trip deleted.', 'success'); navigate('/trips'); }
    } catch (e) { toast(e instanceof Error ? e.message : 'Something went wrong.', 'error'); }
  }

  return (
    <main className="mg-main"><div className="tp-wrap">
      <Link className="mg-back" to={`/t/${trip.id}/board`}><Icon icon={ArrowLeft} className="ico" /> Back to board</Link>

      <div className="mg-head">
        <div>
          <div className="ey"><Icon icon={Settings} className="ico" /> Manage trip</div>
          <h1>{trip.name}</h1>
          <div className="meta">
            {trip.destination && <span className="it"><Icon icon={MapPin} className="ico" /> <span className="hl">{trip.destination}</span></span>}
            <span className="it"><Icon icon={Calendar} className="ico" /> <span className="hl tnum">{fmtRange(trip.checkin, trip.checkout_5n)}</span></span>
            <span className="it"><Icon icon={Users} className="ico" /> <span className="hl">{trip.adults} guests</span></span>
          </div>
        </div>
        <div className="h-actions"><Link className="btn btn-ghost" to={`/t/${trip.id}/board`}><Icon icon={LayoutGrid} className="ico" /> Open board</Link></div>
      </div>

      <div className="mg-grid">
        <div className="mg-col">
          {/* INVITE */}
          <div className="mg-card">
            <div className="c-h"><Icon icon={Link2} className="ico" /><h2>Invite your group</h2></div>
            <p className="c-sub">Anyone with this link can view the board. They sign in to vote, add homes, or comment.</p>
            <div className="invite-row">
              <div className="linkbox"><Icon icon={Link2} className="ico" /><input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} /></div>
              <button className="btn btn-primary" onClick={() => void copy()}><Icon icon={copied ? Check : Copy} className="ico" /> {copied ? 'Copied' : 'Copy link'}</button>
            </div>
            <div className="invite-foot"><Icon icon={ShieldCheck} className="ico" /> Only people you share the link with can find this trip.</div>
            <div className="invite-email">
              <div className="lab">Or invite by email</div>
              <div className="sub">We’ll email each person a one-tap link to join. Separate addresses with commas.</div>
              <div className="row">
                <input className="field" placeholder="alex@email.com, sam@email.com" value={emails} onChange={(e) => setEmails(e.target.value)} />
                <button className="btn btn-ghost" disabled={sending || !emails.trim()} onClick={() => void sendInvites()}><Icon icon={Send} className="ico" /> {sending ? 'Sending…' : 'Send invites'}</button>
              </div>
            </div>
          </div>

          {/* MEMBERS */}
          <div className="mg-card">
            <div className="c-h"><Icon icon={Users} className="ico" /><h2>Members</h2><span className="spacer" /><span className="role-badge mem">{joinedCount} joined</span></div>
            <div className="member-list">
              {members.map((m) => (
                <div className="member-row" key={m.id}>
                  <span className="av">{initials(m.name)}</span>
                  <div className="who">
                    <div className="nm">
                      {m.name}
                      {m.role === 'organizer' ? <span className="role-badge org"><Icon icon={Crown} className="ico" /> Organizer</span> : <span className="role-badge mem">Member</span>}
                    </div>
                    <div className="em">{m.email || '—'}</div>
                  </div>
                  {m.isYou ? <span className="you-tag">That’s you</span> : m.role === 'member' ? (
                    <div className="m-actions">
                      <button className="icon-btn gold" title="Transfer organizer" onClick={() => setConfirm({ kind: 'transfer', member: m })}><Icon icon={Crown} className="ico" /></button>
                      <button className="icon-btn danger" title="Remove from trip" onClick={() => setConfirm({ kind: 'remove', member: m })}><Icon icon={UserMinus} className="ico" /></button>
                    </div>
                  ) : null}
                </div>
              ))}
              {members.length === 0 && <p className="py-3 text-sm text-text-muted">Just you so far — share the invite link to bring your group in.</p>}
            </div>
          </div>

          {/* SETTINGS */}
          <div className="mg-card">
            <div className="c-h"><Icon icon={SlidersHorizontal} className="ico" /><h2>Trip settings</h2></div>
            <p className="c-sub">Changing dates or destination updates what the search looks for. Members keep their votes.</p>
            <form onSubmit={saveSettings} noValidate>
              <div className="set-grid">
                <SetField k="name" label="Trip name" full invalid={invalid.has('name')} err="Give the trip a name.">
                  <input className="field" value={form.name} onChange={set('name')} />
                </SetField>
                <SetField k="destination" label="Destination" full invalid={invalid.has('destination')} err="Add a destination.">
                  <input className="field" value={form.destination} onChange={set('destination')} />
                </SetField>
                <SetField k="checkin" label="Check-in" invalid={invalid.has('checkin')} err="Pick a date.">
                  <input className="field" type="date" value={form.checkin} onChange={set('checkin')} />
                </SetField>
                <SetField k="checkout_5n" label="Check-out" invalid={invalid.has('checkout_5n')} err="Must be after check-in.">
                  <input className="field" type="date" value={form.checkout_5n} onChange={set('checkout_5n')} />
                </SetField>
                <SetField k="adults" label="Guests" invalid={invalid.has('adults')} err="2 or more.">
                  <input className="field" type="number" min={2} value={form.adults} onChange={set('adults')} />
                </SetField>
                <SetField k="budget" label={<>Budget <span className="hint">· all-in</span></>} invalid={invalid.has('budget')} err="Enter a budget.">
                  <div className="prefix"><span className="sign">$</span><input className="field" type="number" value={form.budget} onChange={set('budget')} /></div>
                </SetField>
                <SetField k="home_type" label="Home type">
                  <div className="sel">
                    <select className="field" value={form.home_type} onChange={set('home_type')}>
                      {['Any', 'House', 'Apartment', 'Villa', 'Cabin'].map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <Icon icon={ChevronDown} className="chev" />
                  </div>
                </SetField>
              </div>
              <div className="set-foot">
                <button className="btn btn-primary" type="submit" disabled={savingSet}><Icon icon={Check} className="ico" /> {savingSet ? 'Saving…' : 'Save changes'}</button>
                <button className="btn btn-ghost" type="button" onClick={resetForm}>Discard</button>
                {saved && <span className="saved" style={{ display: 'inline-flex' }}><Icon icon={CheckCircle2} className="ico" /> Saved — back to the board</span>}
              </div>
            </form>
          </div>
        </div>

        {/* SIDEBAR */}
        <aside className="mg-side">
          <div className="mg-card pulse">
            <div className="c-h"><Icon icon={Activity} className="ico" /><h2>Group pulse</h2></div>
            <div className="ptop"><span><Icon icon={Users} className="ico" /> Top-choice votes in</span><span className="tnum">{pulse?.picks ?? 0} of {trip.adults}</span></div>
            <div className="ptrack"><div className="pfill" style={{ width: `${Math.min(100, Math.round(((pulse?.picks ?? 0) / Math.max(trip.adults, 1)) * 100))}%` }} /></div>
            <div className="pulse-stats">
              <div className="pstat"><Icon icon={Users} className="ico" /><div className="v tnum">{pulse?.members ?? trip.memberCount}</div><div className="l">Members</div></div>
              <div className="pstat"><Icon icon={Home} className="ico" /><div className="v tnum">{pulse?.listings ?? 0}</div><div className="l">Homes added</div></div>
              <div className="pstat"><Icon icon={ThumbsUp} className="ico" /><div className="v tnum">{pulse?.votes ?? 0}</div><div className="l">Votes cast</div></div>
              <div className="pstat"><Icon icon={Star} className="ico" /><div className="v tnum">{pulse?.picks ?? 0}</div><div className="l">Top picks</div></div>
            </div>
            {pulse?.decisionLocked ? (
              <div className="decision-status locked"><div className="seal"><Icon icon={BadgeCheck} className="ico" /></div><div><div className="k"><span className="gd" /> Official pick locked</div><div className="nm">The group has a decision.</div></div></div>
            ) : (
              <div className="decision-status"><div>No official pick yet — lock one from the board when the group’s ready.</div></div>
            )}
          </div>
          <div className="mg-card" style={{ padding: '16px 18px' }}>
            <div className="c-h" style={{ marginBottom: 9 }}><Icon icon={Info} className="ico" /><h2 style={{ fontSize: 15 }}>Organizer powers</h2></div>
            <p className="c-sub" style={{ margin: 0, fontSize: 13 }}>Post the itinerary, remove listings, and lock the official pick — all from the board. {pulse?.decisionLocked ? 'An official pick is currently locked.' : 'No official pick locked yet.'}</p>
          </div>
        </aside>
      </div>

      {/* DANGER ZONE */}
      <section className="danger-zone">
        <div className="dz-h"><Icon icon={AlertTriangle} className="ico" /><h2>Danger zone</h2></div>
        <div className="dz-row">
          <div className="dz-info"><div className="t">Reset the official pick</div><div className="s">Unlocks the current pick so the group can keep deciding. Votes are kept.</div></div>
          <button className="btn btn-dz-soft" disabled={!pulse?.decisionLocked} onClick={() => setConfirm({ kind: 'reset' })}><Icon icon={LockOpen} className="ico" /> Reset pick</button>
        </div>
        <div className="dz-row">
          <div className="dz-info"><div className="t">{trip.voting_closed ? 'Reopen voting' : 'Close voting'}</div><div className="s">Freezes likes and top-choices. Members can still view the board. You can reopen anytime.</div></div>
          <button className="btn btn-dz-soft" onClick={() => setConfirm({ kind: 'close' })}><Icon icon={Square} className="ico" /> {trip.voting_closed ? 'Reopen voting' : 'Close voting'}</button>
        </div>
        <div className="dz-row">
          <div className="dz-info"><div className="t">Delete this trip</div><div className="s">Removes the board, its listings, votes, and everything else for all {joinedCount} members. This cannot be undone.</div></div>
          <button className="btn btn-dz" onClick={() => setConfirm({ kind: 'delete' })}><Icon icon={Trash2} className="ico" /> Delete trip</button>
        </div>
      </section>

      {confirm && <ConfirmDialog state={confirm} onCancel={() => setConfirm(null)} onConfirm={runConfirm} />}
    </div></main>
  );
}

function SetField({ k, label, full, invalid, err, children }: { k: string; label: React.ReactNode; full?: boolean; invalid?: boolean; err?: string; children: React.ReactNode }) {
  return (
    <div className={`set-field${full ? ' full' : ''}${invalid ? ' invalid' : ''}`} data-f={k}>
      <label>{label}</label>
      {children}
      {err && <span className="err" style={{ display: invalid ? 'inline-flex' : 'none' }}><Icon icon={AlertCircle} className="ico" /> {err}</span>}
    </div>
  );
}

const CONFIRMS: Record<ConfirmKind, { glyph: typeof Crown; tone: string; title: string; sub: string; cta: string; btn: string; typed?: boolean }> = {
  reset: { glyph: LockOpen, tone: 'gold', title: 'Reset the official pick?', sub: 'The group can keep deciding. All votes are kept.', cta: 'Reset pick', btn: 'btn-primary' },
  close: { glyph: Square, tone: 'warn', title: 'Close voting for everyone?', sub: 'Likes and top-choices freeze. You can reopen voting anytime.', cta: 'Close voting', btn: 'btn-primary' },
  transfer: { glyph: Crown, tone: 'gold', title: 'Transfer organizer?', sub: 'They take over managing this trip. You become a regular member.', cta: 'Transfer', btn: 'btn-primary' },
  remove: { glyph: UserMinus, tone: 'danger', title: 'Remove this member?', sub: 'They lose access to the board. They can rejoin with the invite link.', cta: 'Remove', btn: 'btn-dz' },
  delete: { glyph: Trash2, tone: 'danger', title: 'Delete this trip?', sub: 'This removes the board, listings, votes, and everything else for everyone. It can’t be undone.', cta: 'Delete trip', btn: 'btn-dz', typed: true },
};

function ConfirmDialog({ state, onCancel, onConfirm }: { state: ConfirmState; onCancel: () => void; onConfirm: (typedOk: boolean) => void }) {
  const c = CONFIRMS[state.kind];
  const [typed, setTyped] = useState('');
  const sub = state.member ? `${state.member.name} — ${c.sub}` : c.sub;
  const ok = !c.typed || typed.trim().toUpperCase() === 'DELETE';
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="confirm-scrim open" onClick={onCancel}>
      <div className="confirm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="c-top">
          <div className={`c-icon ${c.tone}`}><Icon icon={c.glyph} className="ico" /></div>
          <div>
            <h3>{c.title}</h3>
            <p className="c-sub">{sub}</p>
          </div>
        </div>
        {c.typed && (
          <div className="c-body">
            <div className="type-lab">Type <b>DELETE</b> to confirm.</div>
            <input className="field" placeholder="DELETE" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </div>
        )}
        <div className="c-foot">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className={`btn ${c.btn}`} disabled={!ok} onClick={() => onConfirm(ok)}>{c.cta}</button>
        </div>
      </div>
    </div>
  );
}

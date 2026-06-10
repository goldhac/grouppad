import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  Sparkles, MapPin, Calendar, CalendarCheck, Users, ArrowRight,
  SlidersHorizontal, ChevronDown, Info, Check, Search,
  CheckCircle2, AlertCircle,
} from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { useIsMobile } from '@/lib/useIsMobile';
import { MobileCreate } from '@/views/MobileCreate';

type SegKey = 'dest' | 'cin' | 'cout' | 'guests';

export function CreateTripView() {
  const { user, accountLoading, createTrip, openAuth } = useApp();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [form, setForm] = useState({
    dest: '', cin: '', cout: '', guests: '8',
    name: '', beds: '', budget: '', type: 'Any', flex: '0', itin: '',
  });
  const [invalid, setInvalid] = useState<Set<SegKey>>(new Set());
  const [focus, setFocus] = useState<SegKey | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!accountLoading && !user) openAuth('create a trip');
  }, [accountLoading, user, openAuth]);

  if (accountLoading) return <div className="py-24 text-center text-text-muted">Loading…</div>;
  if (!user) return <Navigate to="/" replace />;
  if (isMobile) return <MobileCreate />;

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  /** Mirrors the prototype validate(): one message, marks the offending segment.
   *  Returns the offending keys so the caller can act on the *current* result
   *  (state setters are async, so reading `invalid` right after would be stale). */
  function validate(): SegKey[] {
    const bad = new Set<SegKey>();
    let text = '';
    if (!form.dest.trim()) { bad.add('dest'); text = 'Add a destination to search.'; }
    else if (!form.cin || !form.cout) {
      if (!form.cin) bad.add('cin');
      if (!form.cout) bad.add('cout');
      text = 'Pick your check-in and check-out dates.';
    } else if (form.cout <= form.cin) { bad.add('cout'); text = 'Check-out must be after check-in.'; }
    else if (!form.guests || Number(form.guests) < 2) { bad.add('guests'); text = 'How many guests? (2 or more.)'; }
    setInvalid(bad);
    const ok = bad.size === 0;
    setMsg(ok ? { text: 'Looks good. Creating your board…', ok: true } : { text, ok: false });
    return [...bad];
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const bad = validate();
    if (bad.length > 0) {
      // Move focus to the first offending segment (WCAG focus-on-error).
      const first = (['dest', 'cin', 'cout', 'guests'] as SegKey[]).find((k) => bad.includes(k));
      if (first) document.querySelector<HTMLInputElement>(`[data-seg="${first}"] input`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const trip = await createTrip({
        name: form.name.trim() || `${form.dest.trim()} trip`,
        destination: form.dest.trim(),
        checkin: form.cin,
        checkout_5n: form.cout,
        adults: Number(form.guests) || 1,
        budget: Number(form.budget) || 0,
        bedrooms: form.beds ? Number(form.beds) : null,
        home_type: form.type,
        flex_days: Number(form.flex) || 0,
        itinerary: form.itin.trim() || undefined,
      });
      // The board owns the SEARCHING state and auto-fires the capped search.
      navigate(`/t/${trip.id}/board`);
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'Could not create the trip.', ok: false });
      setBusy(false);
    }
  }

  const segCls = (k: SegKey) =>
    `seg${focus === k ? ' focus' : ''}${invalid.has(k) ? ' invalid' : ''}`;
  const segProps = (k: SegKey) => ({
    onFocus: () => setFocus(k),
    onBlur: () => setFocus((c) => (c === k ? null : c)),
  });

  return (
    <main className="tp-main">
      <div className="tp-wrap">
        <div className="ct-wrap">
          <div className="ct-head rv in">
            <span className="k"><Sparkles className="ico" /> Start a trip</span>
            <h1>Set the basics.</h1>
            <p>Where and when. You can share the board with your group right after.</p>
          </div>

          <form onSubmit={submit} noValidate>
            {/* Where / When / Who segmented band */}
            <div className="ct-seg rv in d1">
              <label className={segCls('dest')} data-seg="dest">
                <span className="k"><MapPin className="ico" /> Where</span>
                <input name="dest" type="text" autoComplete="off" placeholder="Add a destination"
                  value={form.dest} onChange={set('dest')} {...segProps('dest')} />
              </label>
              <label className={segCls('cin')} data-seg="cin">
                <span className="k"><Calendar className="ico" /> Check-in</span>
                <input name="cin" type="date" value={form.cin} onChange={set('cin')} {...segProps('cin')} />
              </label>
              <label className={segCls('cout')} data-seg="cout">
                <span className="k"><CalendarCheck className="ico" /> Check-out</span>
                <input name="cout" type="date" value={form.cout} onChange={set('cout')} {...segProps('cout')} />
              </label>
              <label className={segCls('guests')} data-seg="guests">
                <span className="k"><Users className="ico" /> Who</span>
                <input name="guests" type="number" min={2} max={50} placeholder="Guests"
                  value={form.guests} onChange={set('guests')} {...segProps('guests')} />
              </label>
              <div className="seg go">
                <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
                  <ArrowRight className="ico" /> Create
                </button>
              </div>
            </div>
            <div
              className={`ct-seg-msg${msg?.ok ? ' ok' : ''}`}
              role={msg && !msg.ok ? 'alert' : undefined}
              aria-live={msg?.ok ? 'polite' : 'assertive'}
            >
              {msg && (msg.ok
                ? <><CheckCircle2 className="ico" aria-hidden /> {msg.text}</>
                : <><AlertCircle className="ico" aria-hidden /> {msg.text}</>)}
            </div>

            {/* Fine-tune the search — all optional */}
            <div className="ct-card rv in d2">
              <div className="ct-card-h">
                <SlidersHorizontal className="ico" />
                <span className="t">Fine-tune the search</span>
                <span className="opt">all optional</span>
              </div>
              <div className="ct-grid">
                <div className="ct-field">
                  <label>Trip name <span className="hint">(optional)</span></label>
                  <input className="field" name="name" type="text" placeholder="e.g. Mike’s 30th in Lisbon"
                    value={form.name} onChange={set('name')} />
                </div>
                <div className="ct-field">
                  <label>Bedrooms <span className="hint">(optional)</span></label>
                  <input className="field" name="beds" type="number" min={1} placeholder="auto from guests"
                    value={form.beds} onChange={set('beds')} />
                </div>
                <div className="ct-field">
                  <label>Budget <span className="hint">· all-in</span></label>
                  <div className="prefix">
                    <span className="sign">$</span>
                    <input className="field" name="budget" type="number" placeholder="7,000"
                      value={form.budget} onChange={set('budget')} />
                  </div>
                  <span className="sub">Splits to a per-person figure on every card.</span>
                </div>
                <div className="ct-field">
                  <label>Home type</label>
                  <div className="sel">
                    <select className="field" name="type" value={form.type} onChange={set('type')}>
                      {['Any', 'House', 'Apartment', 'Villa', 'Cabin'].map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                    <ChevronDown className="chev" />
                  </div>
                </div>
                <div className="ct-field">
                  <label>Date flexibility</label>
                  <div className="sel">
                    <select className="field" name="flex" value={form.flex} onChange={set('flex')}>
                      <option value="0">Exact dates</option>
                      <option value="1">± 1 day</option>
                      <option value="2">± 2 days</option>
                      <option value="3">± 3 days</option>
                      <option value="7">± 1 week</option>
                    </select>
                    <ChevronDown className="chev" />
                  </div>
                  <span className="sub">We check availability across this window.</span>
                </div>
                <div className="ct-field full">
                  <label>Itinerary <span className="hint">(optional)</span></label>
                  <textarea className="field" name="itin"
                    placeholder="Rough plans help tailor the search, e.g. Fri: arrive + dinner downtown. Sat: pool day. Sun: museum…"
                    value={form.itin} onChange={set('itin')} />
                  <span className="sub"><Info className="ico" /> Helps pick nearby reference points and powers Scout, our AI.</span>
                </div>
              </div>
            </div>

            <div className="ct-foot rv in d2">
              <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
                <Check className="ico" /> {busy ? 'Creating…' : 'Create trip'}
              </button>
              <button className="btn btn-ghost btn-lg" type="button" onClick={() => navigate('/trips')} disabled={busy}>
                Cancel
              </button>
              <span className="sp" />
              <span className="note"><Search className="ico" /> Creating kicks off a rentals search for your dates.</span>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

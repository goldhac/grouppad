import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles, MapPin, Users, Pencil, BedDouble, Wallet, Home, ChevronDown, Info, Check, CheckCircle2, AlertCircle, Search } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';

type Form = { dest: string; cin: string; cout: string; guests: string; name: string; beds: string; budget: string; type: string; itin: string };
const HOME_TYPES = ['Any', 'House', 'Apartment', 'Villa', 'Cabin'];

export function MobileCreate() {
  const { createTrip, requireSignIn } = useApp();
  const navigate = useNavigate();
  const [f, setF] = useState<Form>({ dest: '', cin: '', cout: '', guests: '8', name: '', beds: '', budget: '', type: 'Any', itin: '' });
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof Form, v: string) => setF((s) => ({ ...s, [k]: v }));

  const validate = () => {
    const bad = new Set<string>(); let text = '';
    if (!f.dest.trim()) { bad.add('dest'); text = 'Add a destination to search.'; }
    else if (!f.cin || !f.cout) { if (!f.cin) bad.add('cin'); if (!f.cout) bad.add('cout'); text = 'Pick your check-in and check-out dates.'; }
    else if (f.cout <= f.cin) { bad.add('cout'); text = 'Check-out must be after check-in.'; }
    else if (!f.guests || Number(f.guests) < 2) { bad.add('guests'); text = 'How many guests? (2 or more.)'; }
    setInvalid(bad);
    setMsg(bad.size === 0 ? { text: 'Looks good — creating your board…', ok: true } : { text, ok: false });
    return bad.size === 0;
  };

  const submit = async () => {
    if (!validate() || busy) return;
    if (!requireSignIn('create a trip')) return;
    setBusy(true);
    try {
      const trip = await createTrip({
        name: f.name.trim() || undefined,
        destination: f.dest.trim(),
        checkin: f.cin,
        checkout_5n: f.cout,
        adults: Number(f.guests) || 2,
        budget: Number(f.budget) || 0,
        bedrooms: f.beds ? Number(f.beds) : null,
        home_type: f.type,
        itinerary: f.itin.trim() || undefined,
      });
      navigate(`/t/${trip.id}/board`);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Could not create the trip.', ok: false });
      setBusy(false);
    }
  };

  const field = (key: keyof Form, label: string, opts: { icon?: typeof MapPin; type?: string; ph?: string; hint?: string; sign?: string; min?: number; max?: number; sub?: string; subicon?: typeof Info; select?: string[] } = {}) => {
    const cls = `bfield${invalid.has(key) ? ' invalid' : ''}${focus === key ? ' focus' : ''}`;
    return (
      <div className={cls} onFocus={() => setFocus(key)} onBlur={() => setFocus((x) => (x === key ? null : x))}>
        <label>{label}{opts.hint && <span className="hint"> {opts.hint}</span>}</label>
        <div className="inp">
          {opts.icon && <span className="lead"><Icon icon={opts.icon} className="ico" /></span>}
          {opts.sign && <span className="sign">{opts.sign}</span>}
          {opts.select ? (
            <>
              <select value={f[key]} onChange={(e) => set(key, e.target.value)}>{opts.select.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              <span className="chev"><Icon icon={ChevronDown} className="ico" /></span>
            </>
          ) : opts.type === 'textarea' ? (
            <textarea placeholder={opts.ph} value={f[key]} onChange={(e) => set(key, e.target.value)} />
          ) : (
            <input type={opts.type || 'text'} placeholder={opts.ph} value={f[key]} min={opts.min} max={opts.max} autoComplete={opts.type === 'date' ? undefined : 'off'} onChange={(e) => set(key, e.target.value)} />
          )}
        </div>
        {opts.sub && <div className="sub">{opts.subicon && <Icon icon={opts.subicon} className="ico" />} {opts.sub}</div>}
      </div>
    );
  };

  return (
    <div className="gp-mobile">
      <div className="mb">
        <div className="mb-top"><div className="ct-topbar"><div className="ct-back" onClick={() => navigate('/trips')}><Icon icon={ArrowLeft} className="ico" /> Your trips</div></div></div>

        <div className="mb-scroll" style={{ paddingBottom: 132 }}>
          <div className="ct">
            <div className="ct-head">
              <span className="k"><Icon icon={Sparkles} className="ico" /> Start a trip</span>
              <h1>Set the basics.</h1>
              <p>Where and when — you can share the board with your group right after.</p>
            </div>
            {msg && <div className={`ct-msg ${msg.ok ? 'ok' : 'err'}`}><Icon icon={msg.ok ? CheckCircle2 : AlertCircle} className="ico" /> {msg.text}</div>}
            <div className="ct-group">
              <div className="gl">The basics</div>
              {field('dest', 'Where to?', { icon: MapPin, ph: 'Add a destination' })}
              <div className="ct-2">
                {field('cin', 'Check-in', { type: 'date' })}
                {field('cout', 'Check-out', { type: 'date' })}
              </div>
              {field('guests', 'How many guests?', { icon: Users, type: 'number', min: 2, max: 50, ph: 'Guests' })}
            </div>
            <div className="ct-group">
              <div className="gl">Fine-tune the search <span className="opt">all optional</span></div>
              {field('name', 'Trip name', { icon: Pencil, hint: '(optional)', ph: 'e.g. Mike’s 30th in Lisbon' })}
              <div className="ct-2">
                {field('beds', 'Bedrooms', { icon: BedDouble, type: 'number', min: 1, ph: 'auto' })}
                {field('budget', 'Budget', { icon: Wallet, sign: '$', type: 'number', ph: '7,000' })}
              </div>
              {field('type', 'Home type', { icon: Home, select: HOME_TYPES })}
              {field('itin', 'Itinerary', { hint: '(optional)', type: 'textarea', ph: 'Rough plans help tailor the search — e.g. Fri: arrive + dinner. Sat: pool day…', sub: 'Helps pick nearby reference points and powers Scout, our AI.', subicon: Info })}
            </div>
            <div style={{ height: 30 }} />
          </div>
        </div>

        <div className="ct-foot">
          <div className="note"><Icon icon={Search} className="ico" /> Creating kicks off a rentals search for your dates</div>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}><Icon icon={Check} className="ico" /> {busy ? 'Creating…' : 'Create trip'}</button>
        </div>
      </div>
    </div>
  );
}

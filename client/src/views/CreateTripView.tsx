import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';

export function CreateTripView() {
  const { user, accountLoading, createTrip, openAuth } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    destination: '',
    checkin: '',
    checkout_5n: '',
    adults: '8',
    budget: '5000',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (accountLoading) return <div className="py-24 text-center text-muted">Loading…</div>;
  if (!user) {
    openAuth('create a trip');
    return <Navigate to="/" replace />;
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.destination.trim()) return setErr('Where are you going?');
    if (!form.checkin || !form.checkout_5n) return setErr('Add your check-in and check-out dates.');
    if (form.checkout_5n <= form.checkin) return setErr('Check-out must be after check-in.');
    setBusy(true);
    try {
      const trip = await createTrip({
        name: form.name.trim() || `${form.destination.trim()} trip`,
        destination: form.destination.trim(),
        checkin: form.checkin,
        checkout_5n: form.checkout_5n,
        adults: Number(form.adults) || 1,
        budget: Number(form.budget) || 0,
      });
      navigate(`/t/${trip.id}/board`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not create the trip.');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold">Start a trip</h1>
      <p className="mt-1 text-sm text-muted">
        Set the basics — you can share the board with your group right after.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Trip name (optional)">
          <input value={form.name} onChange={set('name')} placeholder="Mike's 30th in Lisbon" className={inputCls} />
        </Field>
        <Field label="Destination">
          <input value={form.destination} onChange={set('destination')} placeholder="Lisbon, Portugal" className={inputCls} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check-in">
            <input type="date" value={form.checkin} onChange={set('checkin')} className={inputCls} required />
          </Field>
          <Field label="Check-out">
            <input type="date" value={form.checkout_5n} onChange={set('checkout_5n')} className={inputCls} required />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Guests">
            <input type="number" min={1} max={50} value={form.adults} onChange={set('adults')} className={inputCls} />
          </Field>
          <Field label="Budget (all-in, $)">
            <input type="number" min={0} step={100} value={form.budget} onChange={set('budget')} className={inputCls} />
          </Field>
        </div>

        {err && <p className="text-sm text-danger">{err}</p>}

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create trip'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate('/trips')} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  'h-10 w-full rounded-md border border-border bg-panel-2 px-3 text-sm text-text outline-none focus:ring-2 focus:ring-accent';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-text">{label}</span>
      {children}
    </label>
  );
}

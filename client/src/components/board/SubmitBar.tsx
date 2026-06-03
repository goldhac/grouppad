import { useMemo, useState } from 'react';
import { Plus, ExternalLink } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';
import { openWithDatesUrl } from '@/lib/utils';

export function SubmitBar() {
  const { submitListing, requireSignIn, openDetail } = useApp();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const openLink = useMemo(() => openWithDatesUrl(url), [url]);

  async function submit() {
    if (!requireSignIn('add a listing')) return;
    if (!url.trim()) {
      setMsg({ text: 'Paste a listing URL first.', ok: false });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const created = await submitListing(url.trim(), price.trim() || undefined);
      setUrl('');
      setPrice('');
      setMsg({ text: 'Added! Find it under Community Submissions.', ok: true });
      openDetail(created.id);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        requireSignIn('add a listing');
      } else {
        setMsg({ text: e instanceof Error ? e.message : 'Could not add that listing.', ok: false });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 py-4 sm:px-8">
      {!open ? (
        <Button variant="default" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add a listing
        </Button>
      ) : (
        <div className="rounded-lg border border-border bg-panel p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              autoFocus
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              placeholder="Paste any rental listing URL…"
              className="h-10 flex-1 rounded-md border border-border bg-panel-2 px-3 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
            {openLink && (
              <a
                href={openLink.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 whitespace-nowrap px-2 text-sm text-link hover:underline"
                title="Opens the listing with the trip dates pre-filled so you can read off the price"
              >
                {openLink.label} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Total price for the trip dates (paste from listing)"
              className="h-10 flex-1 rounded-md border border-border bg-panel-2 px-3 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
            <Button variant="primary" onClick={() => void submit()} disabled={busy}>
              {busy ? 'Fetching details…' : 'Submit'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
          {msg && <p className={msg.ok ? 'mt-2 text-sm text-accent' : 'mt-2 text-sm text-danger'}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}

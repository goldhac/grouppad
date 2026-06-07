import { useEffect, useRef, useState } from 'react';
import { Map, Upload, Save, Trash2 } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';
import { ItineraryCard } from '@/components/board/ItineraryCard';

export function ItinerarySection() {
  const { itinerary, isOwner, saveItinerary } = useApp();
  const [draft, setDraft] = useState(itinerary.text);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const focused = useRef(false);

  // Keep the editor in sync with server state unless the admin is editing.
  useEffect(() => {
    if (!focused.current) setDraft(itinerary.text);
  }, [itinerary.text]);

  async function save(text: string) {
    setBusy(true);
    try {
      await saveItinerary(text);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setDraft(text.slice(0, 8000));
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <section className="px-4 py-3 sm:px-8">
      <div className="rounded-lg border border-border bg-panel p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Map className="h-4 w-4" /> Trip itinerary
          </span>
          <span className="text-xs text-muted">Posted by the organizer — feeds Scout’s ranking & compare</span>
        </div>

        <div className="mt-3">
          {itinerary.text
            ? <ItineraryCard />
            : !isOwner && <p className="text-sm italic text-muted">No itinerary posted yet.</p>}
        </div>

        {isOwner && (
          <div className="mt-3 border-t border-border pt-3">
            <textarea
              value={draft}
              onFocus={() => (focused.current = true)}
              onBlur={() => (focused.current = false)}
              onChange={(e) => setDraft(e.target.value.slice(0, 8000))}
              rows={4}
              placeholder="Admin: post the one canonical itinerary here. e.g. Day 1: arrive, dinner in Santa Monica…"
              className="w-full rounded-md border border-border bg-panel-2 p-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,text/plain"
                hidden
                onChange={onFile}
              />
              <Button variant="default" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" /> Upload text
              </Button>
              <Button variant="primary" size="sm" disabled={busy} onClick={() => void save(draft)}>
                <Save className="h-3.5 w-3.5" /> Save itinerary
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (confirm('Clear the itinerary?')) {
                    setDraft('');
                    void save('');
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

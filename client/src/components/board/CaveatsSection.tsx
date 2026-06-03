import { useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Button } from '@/components/ui/Button';

export function CaveatsSection() {
  const { caveats, isOwner, postCaveat, deleteCaveat } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      await postCaveat(t);
      setText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="px-4 py-3 sm:px-8">
      <div className="rounded-lg border border-border bg-panel p-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <MessageSquare className="h-4 w-4" /> Group caveats
          </span>
          <span className="text-xs text-muted">
            Drop your must-haves & dealbreakers — they feed the AI ranking
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {caveats.length === 0 && <p className="text-sm text-muted">No caveats yet — be the first.</p>}
          {[...caveats].reverse().map((c) => (
            <div key={c.id} className="flex items-start gap-2 rounded-md bg-panel-2 px-3 py-2 text-sm">
              <div className="flex-1">
                <span className="font-semibold">{c.name}</span> <span className="text-text">{c.text}</span>
              </div>
              {isOwner && (
                <button
                  className="text-muted hover:text-danger"
                  onClick={() => void deleteCaveat(c.id)}
                  aria-label="Delete caveat"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            placeholder="e.g. I need a ground-floor room; parking is a must"
            className="h-10 flex-1 rounded-md border border-border bg-panel-2 px-3 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
          <Button variant="default" onClick={() => void send()} disabled={busy}>
            Post
          </Button>
        </div>
      </div>
    </section>
  );
}

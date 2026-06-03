import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthModal() {
  const { authModal, closeAuth } = useApp();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [sending, setSending] = useState(false);

  const sub = authModal.reason
    ? `Sign in to ${authModal.reason} — your votes and picks stay tied to you across devices.`
    : 'Sign in so your votes and picks are saved and tied to you across devices.';

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) {
      setMsg({ text: 'Enter a valid email address.', ok: false });
      return;
    }
    setSending(true);
    setMsg(null);
    try {
      await api.requestMagicLink(email.trim());
      setMsg({ text: 'Check your inbox — the link expires in 15 minutes.', ok: true });
      setEmail('');
    } catch (err) {
      setMsg({
        text: err instanceof ApiError ? err.message : 'Could not send the email. Try again shortly.',
        ok: false,
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={authModal.open} onOpenChange={(o) => !o && closeAuth()}>
      <DialogContent width="max-w-[400px]">
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="text-4xl">🏡</div>
          <DialogTitle className="text-lg font-bold">Sign in to GroupPad</DialogTitle>
          <DialogDescription className="text-sm text-muted">{sub}</DialogDescription>
        </div>

        <Button
          variant="default"
          className="w-full bg-white text-[#1f1f1f] hover:bg-white/90"
          onClick={() => {
            window.location.href = api.googleSignInUrl;
          }}
        >
          <span className="font-bold text-[#4285F4]">G</span> Continue with Google
        </Button>

        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-border" /> or use email <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={sendMagicLink} className="flex gap-2" noValidate>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            className="h-10 flex-1 rounded-md border border-border bg-panel-2 px-3 text-sm text-text outline-none focus:ring-2 focus:ring-accent"
          />
          <Button type="submit" variant="primary" disabled={sending}>
            {sending ? 'Sending…' : 'Email me a link'}
          </Button>
        </form>

        {msg && (
          <p className={msg.ok ? 'text-sm text-accent' : 'text-sm text-danger'} aria-live="polite">
            {msg.text}
          </p>
        )}

        <p className="text-center text-xs text-muted">
          We'll never post anything. A one-time link signs you in — no password to remember.
        </p>
      </DialogContent>
    </Dialog>
  );
}

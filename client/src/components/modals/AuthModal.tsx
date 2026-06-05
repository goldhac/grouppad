import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Mail, MailCheck, AlertCircle, ArrowLeft } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import { PeakLogo } from '@/components/ui/PeakLogo';
import { useFocusTrap } from '@/lib/useFocusTrap';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 4-colour Google "G". */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

const REASONS: Record<string, { ey: string; h: string; p: string }> = {
  vote: { ey: 'Sign in to vote', h: 'Join the group to vote', p: 'Sign in to thumbs-up the homes you love and help your group decide.' },
  join: { ey: 'Trip invite', h: 'Join the trip', p: 'Sign in to view the board, vote, and add places — no password, just a one-tap link.' },
  start: { ey: '', h: 'Start planning', p: 'Create a board, invite your group by link, and decide on one rental together.' },
  default: { ey: '', h: 'Sign in to GroupPad', p: 'Plan a trip your whole group agrees on — browse, vote, and lock one rental together.' },
};
function reasonContent(reason?: string) {
  const r = (reason || '').toLowerCase();
  if (/vote|thumb|top choice|pick/.test(r)) return REASONS.vote;
  if (/join/.test(r)) return REASONS.join;
  if (/start|create|trip/.test(r)) return REASONS.start;
  return REASONS.default;
}

export function AuthModal() {
  const { authModal, closeAuth } = useApp();
  const open = authModal.open;
  const [stage, setStage] = useState<'choose' | 'sent'>('choose');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [resendLeft, setResendLeft] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  useFocusTrap(scrimRef, open);

  // reset on open
  useEffect(() => {
    if (open) { setStage('choose'); setErr(null); setEmail(''); setTimeout(() => inputRef.current?.focus(), 60); }
  }, [open]);
  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeAuth();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeAuth]);
  // resend cooldown
  useEffect(() => {
    if (resendLeft <= 0) return;
    const t = window.setTimeout(() => setResendLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendLeft]);

  if (!open) return null;
  const r = reasonContent(authModal.reason);

  async function send(addr: string) {
    setSending(true); setErr(null);
    try {
      await api.requestMagicLink(addr);
      setSentTo(addr); setStage('sent'); setResendLeft(30);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not send the email. Try again shortly.');
    } finally { setSending(false); }
  }
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setErr('Enter a valid email address.'); inputRef.current?.focus(); return; }
    void send(email.trim());
  }

  return (
    <div className="modal-scrim open" ref={scrimRef} onClick={closeAuth}>
      {stage === 'choose' ? (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="auTitle" onClick={(e) => e.stopPropagation()}>
          <button className="modal-x" aria-label="Close" onClick={closeAuth}><Icon icon={X} className="ico" /></button>
          <div className="au-body">
            <span className="au-logo"><PeakLogo /> GroupPad</span>
            <div className="au-h">
              {r.ey && <div className="reason"><Icon icon={Sparkles} className="ico" /> {r.ey}</div>}
              <h2 id="auTitle">{r.h}</h2>
              <p>{r.p}</p>
            </div>
            <div className="au-methods">
              <button className="btn-google" onClick={() => { window.location.href = api.googleSignInUrl; }}>
                <GoogleG /> Continue with Google
              </button>
              <div className="au-or">or</div>
              <form onSubmit={onSubmit} noValidate>
                <label className="au-field-label" htmlFor="authEmail">Email address</label>
                <div className="au-input-row">
                  <input
                    ref={inputRef} className={`field${err ? ' is-error' : ''}`} id="authEmail" name="email" type="email"
                    inputMode="email" autoComplete="email" placeholder="you@email.com"
                    value={email} onChange={(e) => { setEmail(e.target.value); if (err) setErr(null); }}
                  />
                  {err && <div className="au-msg" role="alert" style={{ display: 'flex' }}><Icon icon={AlertCircle} className="ico" /> <span>{err}</span></div>}
                  <button className="btn btn-primary au-submit" type="submit" disabled={sending}><Icon icon={Mail} className="ico" /> {sending ? 'Sending…' : 'Email me a sign-in link'}</button>
                </div>
              </form>
            </div>
            <p className="au-fine">By continuing you agree to our <a href="#">Terms</a> and <a href="#">Privacy Policy</a>. We’ll never post or email your group without you.</p>
          </div>
        </div>
      ) : (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="auSentTitle" onClick={(e) => e.stopPropagation()}>
          <button className="modal-x" aria-label="Close" onClick={closeAuth}><Icon icon={X} className="ico" /></button>
          <div className="au-sent">
            <span className="env"><Icon icon={MailCheck} className="ico" /></span>
            <h2 id="auSentTitle">Check your inbox</h2>
            <p>We sent a one-tap sign-in link to<br /><b>{sentTo}</b>. It works once and expires in 15 minutes.</p>
            <div className="actions">
              <div className="resend">
                Didn’t get it?{' '}
                <button data-resend disabled={resendLeft > 0 || sending} onClick={() => void send(sentTo)}>Resend link</button>{' '}
                {resendLeft > 0 && <span style={{ whiteSpace: 'nowrap' }}>({resendLeft}s)</span>}
              </div>
              <button className="change" onClick={() => { setStage('choose'); setErr(null); setTimeout(() => inputRef.current?.focus(), 60); }}>
                <Icon icon={ArrowLeft} className="ico" /> Use a different email
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

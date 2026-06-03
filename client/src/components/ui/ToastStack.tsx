import { CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { cn } from '@/lib/cn';
import type { Toast } from '@/store/AppContext';

const ICON: Record<Toast['type'], typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: AlertTriangle,
};

const TONE: Record<Toast['type'], string> = {
  info: 'border-border',
  success: 'border-accent/50',
  error: 'border-danger/50',
};

const ICON_TONE: Record<Toast['type'], string> = {
  info: 'text-link',
  success: 'text-accent',
  error: 'text-danger',
};

export function ToastStack() {
  const { toasts, dismissToast } = useApp();
  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2"
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => {
        const Icon = ICON[t.type];
        return (
          <button
            key={t.id}
            onClick={() => dismissToast(t.id)}
            className={cn(
              'flex items-start gap-2.5 rounded-lg border bg-panel px-3.5 py-3 text-left text-sm text-text shadow-xl animate-toast-in',
              TONE[t.type],
            )}
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', ICON_TONE[t.type])} />
            <span className="flex-1">{t.message}</span>
          </button>
        );
      })}
    </div>
  );
}

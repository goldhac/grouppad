import { CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { useApp } from '@/store/AppContext';
import { Icon } from '@/components/ui/Icon';
import type { Toast } from '@/store/AppContext';

const ICON: Record<Toast['type'], typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: AlertTriangle,
};

export function ToastStack() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toast-stack" aria-live="polite" role="status">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismissToast(t.id)}
          className={`toast ${t.type}`}
          style={{ textAlign: 'left', cursor: 'pointer' }}
        >
          <Icon icon={ICON[t.type]} className="ico" />
          <span className="tmsg">{t.message}</span>
        </button>
      ))}
    </div>
  );
}

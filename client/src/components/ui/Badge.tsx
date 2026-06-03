import { cn } from '@/lib/cn';
import type { BudgetTier } from '@/types';

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-border bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

const BUDGET_LABEL: Record<BudgetTier, string> = {
  under: 'under budget',
  marginal: 'marginal',
  over: 'over budget',
  unknown: 'price TBD',
};

const BUDGET_TONE: Record<BudgetTier, string> = {
  under: 'border-accent/40 bg-accent/10 text-accent',
  marginal: 'border-warn/40 bg-warn/10 text-warn',
  over: 'border-danger/40 bg-danger/10 text-danger',
  unknown: 'border-border bg-panel-2 text-muted',
};

export function BudgetBadge({ tier }: { tier: BudgetTier | undefined }) {
  const t = tier ?? 'unknown';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        BUDGET_TONE[t],
      )}
    >
      {BUDGET_LABEL[t]}
    </span>
  );
}

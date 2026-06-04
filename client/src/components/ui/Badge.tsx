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
        'inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface-inset px-2.5 py-1 text-[11.5px] font-semibold text-text-muted',
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
  under: 'bg-under-bg text-under border-under-border',
  marginal: 'bg-marginal-bg text-marginal border-marginal-border',
  over: 'bg-over-bg text-over border-over-border',
  unknown: 'bg-unknown-bg text-unknown border-unknown-border',
};

export function BudgetBadge({ tier }: { tier: BudgetTier | undefined }) {
  const t = tier ?? 'unknown';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-[11.5px] font-semibold',
        BUDGET_TONE[t],
      )}
    >
      {BUDGET_LABEL[t]}
    </span>
  );
}

import clsx from 'clsx';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  /** Percentage change against the comparison period. Omit when there is none. */
  changePercentage?: number;
  comparisonLabel?: string;
  icon?: ReactNode;
  tone?: 'ember' | 'mint' | 'sky' | 'chili';
  footer?: ReactNode;
}

const TONE_CLASS = {
  ember: 'text-ember bg-ember-soft',
  mint: 'text-mint bg-mint-soft',
  sky: 'text-sky bg-sky-soft',
  chili: 'text-chili bg-chili-soft',
} as const;

export function StatCard({
  label,
  value,
  changePercentage,
  comparisonLabel = 'vs last period',
  icon,
  tone = 'ember',
  footer,
}: StatCardProps) {
  const isPositive = (changePercentage ?? 0) >= 0;

  return (
    <article className="panel-interactive p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="eyebrow">{label}</p>
        {icon && (
          <span className={clsx('rounded-control p-2', TONE_CLASS[tone])}>{icon}</span>
        )}
      </div>

      <p className="numeric mt-3 text-3xl font-semibold text-ink">{value}</p>

      {changePercentage !== undefined && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <span className={clsx('flex items-center gap-1 font-medium', isPositive ? 'text-mint' : 'text-chili')}>
            {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {Math.abs(changePercentage).toFixed(1)}%
          </span>
          <span className="text-ink-faint">{comparisonLabel}</span>
        </div>
      )}

      {footer && <div className="mt-3 border-t border-line pt-3 text-xs text-ink-soft">{footer}</div>}
    </article>
  );
}

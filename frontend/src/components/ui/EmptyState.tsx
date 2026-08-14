import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  /** Says what to do next. An empty screen is an invitation, not a dead end. */
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-panel/50 px-6 py-14 text-center animate-rise-in">
      {icon && (
        <span className="mb-4 rounded-full bg-raised p-3.5 text-ink-faint">{icon}</span>
      )}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-soft">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

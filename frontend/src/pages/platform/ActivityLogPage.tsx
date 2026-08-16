import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { apiGet } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate, formatTime, humanise } from '@/utils/format';
import type { ActivityLogEntry } from '@/types/api';

/** "status: active → suspended" - only the fields that actually changed. */
function changeSummary(entry: ActivityLogEntry): string | null {
  if (!entry.oldValues || !entry.newValues) return null;

  const changed = Object.keys(entry.newValues).filter(
    (key) => key in entry.oldValues! && entry.oldValues![key] !== entry.newValues![key],
  );

  if (changed.length === 0) return null;

  return changed
    .map((key) => `${humanise(key)}: ${String(entry.oldValues![key])} → ${String(entry.newValues![key])}`)
    .join(', ');
}

/**
 * What the Super Admin has done on the platform console - onboarding a
 * restaurant, changing its terms or status, running a settlement. Scoped to
 * that: a tenant's own day-to-day activity (orders, refunds, staff changes)
 * is not logged here.
 */
export default function ActivityLogPage() {
  const { data: entries, isLoading } = useQuery({
    queryKey: ['platform', 'activity'],
    queryFn: () => apiGet<ActivityLogEntry[]>(endpoints.platform.activity),
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Platform</p>
        <h1 className="mt-1.5 text-display-md text-ink">Activity log</h1>
        <p className="mt-2 text-sm text-ink-soft">
          What you've done from this console, and to which restaurant.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : entries && entries.length > 0 ? (
        <div className="panel divide-y divide-line overflow-hidden">
          {entries.map((entry) => {
            const summary = changeSummary(entry);

            return (
              <article key={entry.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {humanise(entry.action.replace(/\./g, ' '))}
                    {entry.restaurant && (
                      <span className="text-ink-soft"> · {entry.restaurant.name}</span>
                    )}
                  </p>

                  {summary && <p className="mt-1 text-xs text-ink-faint">{summary}</p>}

                  <p className="mt-1 text-xs text-ink-faint">
                    {entry.user?.fullName ?? 'Unknown admin'}
                  </p>
                </div>

                <div className="shrink-0 text-right text-xs text-ink-faint">
                  <p>{formatDate(entry.createdAt)}</p>
                  <p>{formatTime(entry.createdAt)}</p>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          title="Nothing logged yet"
          description="Onboarding a restaurant, changing its terms or status, and running a settlement all show up here."
        />
      )}
    </div>
  );
}

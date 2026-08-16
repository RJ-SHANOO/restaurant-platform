import { useQuery } from '@tanstack/react-query';
import { Percent } from 'lucide-react';
import { apiGet } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate, formatMoney } from '@/utils/format';
import type { CommissionEntry } from '@/types/api';

const STATUS_PILL: Record<CommissionEntry['status'], string> = {
  pending: 'pill pill-ember',
  settled: 'pill pill-mint',
};

/**
 * The ledger dashboard() totals up, one entry at a time. A charge is written
 * when a bill is fully paid; a refund never edits that row, it appends a
 * reversal that nets against it - both show up here, side by side.
 */
export default function CommissionPage() {
  const { data: entries, isLoading } = useQuery({
    queryKey: ['platform', 'commission'],
    queryFn: () => apiGet<CommissionEntry[]>(endpoints.platform.commission),
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Revenue</p>
        <h1 className="mt-1.5 text-display-md text-ink">Commission</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Every charge and reversal, across every restaurant.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : entries && entries.length > 0 ? (
        <div className="panel overflow-hidden">
          <div className="hidden grid-cols-12 gap-4 border-b border-line px-5 py-3 lg:grid">
            <span className="eyebrow col-span-3">Restaurant</span>
            <span className="eyebrow col-span-2">Type</span>
            <span className="eyebrow col-span-2">Bill amount</span>
            <span className="eyebrow col-span-2">Commission</span>
            <span className="eyebrow col-span-2">Status</span>
            <span className="eyebrow col-span-1">Date</span>
          </div>

          <div className="divide-y divide-line stagger-children">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-2 gap-3 px-5 py-4 transition-colors hover:bg-raised lg:grid-cols-12 lg:gap-4"
              >
                <p className="col-span-2 font-medium text-ink lg:col-span-3">
                  {entry.restaurant.name}
                </p>

                <p className="text-sm capitalize text-ink-soft lg:col-span-2">{entry.type}</p>

                <p className="numeric text-sm text-ink-soft lg:col-span-2">
                  {formatMoney(entry.baseAmount)}
                </p>

                <p
                  className={`numeric text-sm font-semibold lg:col-span-2 ${
                    entry.amount < 0 ? 'text-chili' : 'text-ember'
                  }`}
                >
                  {formatMoney(entry.amount)}
                </p>

                <div className="lg:col-span-2">
                  <span className={STATUS_PILL[entry.status]}>
                    <span className="status-dot" />
                    {entry.status}
                  </span>
                </div>

                <p className="text-xs text-ink-faint lg:col-span-1">{formatDate(entry.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Percent className="h-6 w-6" />}
          title="No commission yet"
          description="An entry is written the moment a bill is fully paid. None have happened yet."
        />
      )}
    </div>
  );
}

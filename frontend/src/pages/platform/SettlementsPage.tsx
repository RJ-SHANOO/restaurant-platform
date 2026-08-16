import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { apiGet } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate, formatMoney } from '@/utils/format';
import type { Settlement } from '@/types/api';

const STATUS_PILL: Record<Settlement['status'], string> = {
  open: 'pill pill-sky',
  finalised: 'pill pill-ember',
  paid: 'pill pill-mint',
};

/**
 * What each restaurant owes, period by period. A settlement is created from
 * a restaurant's own page (platformController.runSettlement) - this screen
 * is just the ledger of every one that has happened, across every restaurant.
 */
export default function SettlementsPage() {
  const { data: settlements, isLoading } = useQuery({
    queryKey: ['platform', 'settlements'],
    queryFn: () => apiGet<Settlement[]>(endpoints.platform.settlements),
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Revenue</p>
        <h1 className="mt-1.5 text-display-md text-ink">Settlements</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Commission settled per restaurant, one period at a time.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : settlements && settlements.length > 0 ? (
        <div className="panel overflow-hidden">
          <div className="hidden grid-cols-12 gap-4 border-b border-line px-5 py-3 lg:grid">
            <span className="eyebrow col-span-3">Restaurant</span>
            <span className="eyebrow col-span-2">Settlement</span>
            <span className="eyebrow col-span-2">Period</span>
            <span className="eyebrow col-span-2">Gross sales</span>
            <span className="eyebrow col-span-2">Commission</span>
            <span className="eyebrow col-span-1">Status</span>
          </div>

          <div className="divide-y divide-line stagger-children">
            {settlements.map((settlement) => (
              <div
                key={settlement.id}
                className="grid grid-cols-2 gap-3 px-5 py-4 transition-colors hover:bg-raised lg:grid-cols-12 lg:gap-4"
              >
                <p className="col-span-2 font-medium text-ink lg:col-span-3">
                  {settlement.restaurant.name}
                </p>

                <p className="numeric text-sm text-ink-soft lg:col-span-2">
                  {settlement.settlementNumber}
                </p>

                <p className="text-xs text-ink-faint lg:col-span-2">
                  {formatDate(settlement.periodStart)} – {formatDate(settlement.periodEnd)}
                </p>

                <p className="numeric text-sm text-ink lg:col-span-2">
                  {formatMoney(settlement.grossSales)}
                </p>

                <p className="numeric text-sm font-semibold text-ember lg:col-span-2">
                  {formatMoney(settlement.commissionTotal)}
                </p>

                <div className="lg:col-span-1">
                  <span className={STATUS_PILL[settlement.status]}>
                    <span className="status-dot" />
                    {settlement.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="No settlements yet"
          description="A settlement closes out one restaurant's commission for a period. None have run yet."
        />
      )}
    </div>
  );
}

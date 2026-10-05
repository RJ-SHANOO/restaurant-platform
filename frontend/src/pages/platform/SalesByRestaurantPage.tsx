import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { apiGet } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate, formatMoney, formatNumber } from '@/utils/format';
import type { RestaurantSalesRow } from '@/types/api';

const RANGE_OPTIONS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

/**
 * Who sold how much, which day. Same definition as a restaurant's own
 * "revenue by day" report (completed orders, placed date) - just every
 * tenant at once, so the Super Admin does not have to open each one.
 */
export default function SalesByRestaurantPage() {
  const [days, setDays] = useState(7);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['platform', 'sales-by-restaurant', days],
    queryFn: () => apiGet<RestaurantSalesRow[]>(endpoints.platform.salesByRestaurant, { days }),
  });

  const total = (rows ?? []).reduce((sum, row) => sum + row.sales, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Revenue</p>
          <h1 className="mt-1.5 text-display-md text-ink">Daily sales by restaurant</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Completed orders only, one row per restaurant per day.
          </p>
        </div>

        <select
          className="field w-auto"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          {RANGE_OPTIONS.map((option) => (
            <option key={option.days} value={option.days}>{option.label}</option>
          ))}
        </select>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : rows && rows.length > 0 ? (
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <p className="text-xs text-ink-soft">{rows.length} restaurant-day{rows.length === 1 ? '' : 's'}</p>
            <p className="numeric text-sm font-semibold text-ink">Total: {formatMoney(total)}</p>
          </div>

          <div className="hidden grid-cols-12 gap-4 border-b border-line px-5 py-3 lg:grid">
            <span className="eyebrow col-span-3">Date</span>
            <span className="eyebrow col-span-5">Restaurant</span>
            <span className="eyebrow col-span-2">Orders</span>
            <span className="eyebrow col-span-2">Sales</span>
          </div>

          <div className="divide-y divide-line stagger-children">
            {rows.map((row) => (
              <div
                key={`${row.restaurantId}:${row.date}`}
                className="grid grid-cols-2 gap-3 px-5 py-4 transition-colors hover:bg-raised lg:grid-cols-12 lg:gap-4"
              >
                <p className="text-xs text-ink-faint lg:col-span-3">{formatDate(row.date)}</p>
                <p className="col-span-2 font-medium text-ink lg:col-span-5">{row.restaurantName}</p>
                <p className="numeric text-sm text-ink-soft lg:col-span-2">{formatNumber(row.orders)}</p>
                <p className="numeric text-sm font-semibold text-ember lg:col-span-2">{formatMoney(row.sales)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<BarChart3 className="h-6 w-6" />}
          title="No sales yet"
          description="A row appears here once a restaurant completes its first order in this range."
        />
      )}
    </div>
  );
}

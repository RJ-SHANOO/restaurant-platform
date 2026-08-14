import { useQuery } from '@tanstack/react-query';
import { Percent, Receipt, Store, Wallet } from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { apiGet } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { StatCard } from '@/components/ui/StatCard';
import { StatCardSkeleton } from '@/components/ui/Skeleton';
import { formatCompactMoney, formatNumber } from '@/utils/format';
import type { Restaurant } from '@/types/api';

/**
 * The Super Admin's first screen: how much the platform earned, and which
 * tenants earned it.
 */
export default function PlatformDashboardPage() {
  const { data: restaurants, isLoading } = useQuery({
    queryKey: ['platform', 'restaurants'],
    queryFn: () => apiGet<Restaurant[]>(endpoints.platform.restaurants, { perPage: 50 }),
  });

  const activeCount = restaurants?.filter((restaurant) => restaurant.status === 'active').length ?? 0;
  const branchCount = restaurants?.reduce((total, restaurant) => total + (restaurant.counts?.branches ?? 0), 0) ?? 0;
  const orderCount = restaurants?.reduce((total, restaurant) => total + (restaurant.counts?.orders ?? 0), 0) ?? 0;

  return (
    <div className="space-y-7">
      <header>
        <p className="eyebrow">Platform</p>
        <h1 className="mt-1.5 text-display-lg text-ink">Overview</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Every restaurant on the platform, and what they owe against what they sold.
        </p>
      </header>

      <section className="grid gap-4 stagger-children sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => <StatCardSkeleton key={index} />)
        ) : (
          <>
            <StatCard
              label="Active restaurants"
              value={formatNumber(activeCount)}
              changePercentage={12.4}
              icon={<Store className="h-4 w-4" />}
              tone="ember"
              footer={`${formatNumber(restaurants?.length ?? 0)} registered in total`}
            />
            <StatCard
              label="Branches"
              value={formatNumber(branchCount)}
              changePercentage={8.1}
              icon={<Wallet className="h-4 w-4" />}
              tone="sky"
            />
            <StatCard
              label="Orders processed"
              value={formatNumber(orderCount)}
              changePercentage={23.9}
              icon={<Receipt className="h-4 w-4" />}
              tone="mint"
            />
            <StatCard
              label="Commission accrued"
              value={formatCompactMoney(0)}
              icon={<Percent className="h-4 w-4" />}
              tone="ember"
              footer="Settles weekly by default"
            />
          </>
        )}
      </section>

      <section className="panel p-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Platform revenue</h2>
            <p className="text-xs text-ink-soft">Commission accrued per day</p>
          </div>
        </div>

        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={PLACEHOLDER_SERIES}>
              <defs>
                <linearGradient id="emberFade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F5A524" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#F5A524" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#262E3A" vertical={false} />
              <XAxis dataKey="day" stroke="#5F6B7A" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#5F6B7A" fontSize={11} tickLine={false} axisLine={false} width={48} />
              <Tooltip
                contentStyle={{
                  background: '#14181F',
                  border: '1px solid #35404F',
                  borderRadius: 10,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#97A3B3' }}
              />
              <Area
                type="monotone"
                dataKey="commission"
                stroke="#F5A524"
                strokeWidth={2}
                fill="url(#emberFade)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

/* Replaced by GET /platform/reports/commission-series once that endpoint lands. */
const PLACEHOLDER_SERIES = [
  { day: 'Mon', commission: 0 },
  { day: 'Tue', commission: 0 },
  { day: 'Wed', commission: 0 },
  { day: 'Thu', commission: 0 },
  { day: 'Fri', commission: 0 },
  { day: 'Sat', commission: 0 },
  { day: 'Sun', commission: 0 },
];

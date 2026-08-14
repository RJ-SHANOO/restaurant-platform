import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiGet } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { StatCard } from '@/components/ui/StatCard';
import { StatCardSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCompactMoney, formatDate, formatNumber } from '@/utils/format';
import { useAuth } from '@/context/AuthContext';
import type { Branch, PaymentBreakdownRow, RevenuePoint, SalesSummary, TopItemRow } from '@/types/api';

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * Sales, at the level an owner actually checks: what came in, what went
 * back out as refunds, what got spent, and what sold. Everything here reads
 * from data other services already write - reportService creates nothing.
 */
export default function ReportsPage() {
  const { user } = useAuth();
  const isBranchBound = user?.scope.branchId != null;

  const [from, setFrom] = useState(isoDaysAgo(29));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [branchId, setBranchId] = useState<string>(user?.scope.branchId ? String(user.scope.branchId) : '');

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => apiGet<Branch[]>(endpoints.branches.list),
  });

  const params = { from, to, branchId: branchId || undefined };

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['reports', 'summary', params],
    queryFn: () => apiGet<SalesSummary>(endpoints.reports.summary, params),
  });

  const { data: series, isLoading: seriesLoading } = useQuery({
    queryKey: ['reports', 'revenue-by-day', params],
    queryFn: () => apiGet<RevenuePoint[]>(endpoints.reports.revenueByDay, params),
  });

  const { data: topItems, isLoading: topItemsLoading } = useQuery({
    queryKey: ['reports', 'top-items', params],
    queryFn: () => apiGet<TopItemRow[]>(endpoints.reports.topItems, params),
  });

  const { data: paymentBreakdown, isLoading: breakdownLoading } = useQuery({
    queryKey: ['reports', 'payment-breakdown', params],
    queryFn: () => apiGet<PaymentBreakdownRow[]>(endpoints.reports.paymentBreakdown, params),
  });

  const chartData = (series ?? []).map((point) => ({ ...point, label: formatDate(point.date).replace(/, \d{4}$/, '') }));
  const maxPaymentAmount = Math.max(1, ...(paymentBreakdown ?? []).map((row) => row.amount));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Business</p>
          <h1 className="mt-1.5 text-display-md text-ink">Reports</h1>
          <p className="mt-2 text-sm text-ink-soft">Revenue counts completed orders only - the same rule commission runs on.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isBranchBound && branches && branches.length > 1 && (
            <select className="field w-auto" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          )}
          <input type="date" className="field w-auto" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
          <span className="text-xs text-ink-faint">to</span>
          <input type="date" className="field w-auto" value={to} min={from} max={isoDaysAgo(0)} onChange={(event) => setTo(event.target.value)} />
        </div>
      </header>

      <section className="grid gap-4 stagger-children sm:grid-cols-2 xl:grid-cols-4">
        {summaryLoading || !summary ? (
          Array.from({ length: 4 }).map((_, index) => <StatCardSkeleton key={index} />)
        ) : (
          <>
            <StatCard
              label="Gross revenue"
              value={formatCompactMoney(summary.revenue.gross)}
              icon={<TrendingUp className="h-4 w-4" />}
              tone="mint"
              footer={`${formatNumber(summary.orders.completed)} completed order(s)`}
            />
            <StatCard
              label="Refunds"
              value={formatCompactMoney(summary.revenue.refunds)}
              icon={<TrendingDown className="h-4 w-4" />}
              tone="chili"
            />
            <StatCard
              label="Average order"
              value={formatCompactMoney(summary.revenue.averageOrderValue)}
              icon={<Receipt className="h-4 w-4" />}
              tone="sky"
            />
            <StatCard
              label="Net after expenses"
              value={formatCompactMoney(summary.netAfterExpenses)}
              icon={<Wallet className="h-4 w-4" />}
              tone={summary.netAfterExpenses >= 0 ? 'ember' : 'chili'}
              footer={`Expenses: ${formatCompactMoney(summary.expenses)}`}
            />
          </>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="panel p-5 lg:col-span-3">
          <h2 className="text-base font-semibold text-ink">Revenue by day</h2>
          <p className="mb-5 text-xs text-ink-soft">Completed orders, placed date</p>

          {seriesLoading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : chartData.length > 0 ? (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262E3A" vertical={false} />
                  <XAxis dataKey="label" stroke="#5F6B7A" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#5F6B7A" fontSize={11} tickLine={false} axisLine={false} width={48} />
                  <Tooltip
                    cursor={{ fill: 'rgba(245,165,36,0.07)' }}
                    contentStyle={{ background: '#14181F', border: '1px solid #35404F', borderRadius: 10, fontSize: 12 }}
                    formatter={(value: number) => formatCompactMoney(value)}
                  />
                  <Bar dataKey="revenue" fill="#F5A524" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon={<Banknote className="h-5 w-5" />} title="No completed orders" description="Nothing to chart for this range yet." />
          )}
        </section>

        <section className="panel p-5 lg:col-span-2">
          <h2 className="text-base font-semibold text-ink">Top items</h2>
          <p className="mb-4 text-xs text-ink-soft">By revenue, this range</p>

          {topItemsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-9 w-full" />)}
            </div>
          ) : topItems && topItems.length > 0 ? (
            <ul className="-mx-2 divide-y divide-line">
              {topItems.map((item, index) => (
                <li key={item.productId ?? index} className="flex items-center gap-3 px-2 py-2.5">
                  <span className="numeric w-5 shrink-0 text-xs text-ink-faint">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{item.name}</p>
                    <p className="text-xs text-ink-faint">{item.quantity} sold</p>
                  </div>
                  <span className="numeric shrink-0 text-sm font-semibold text-ink">{formatCompactMoney(item.revenue)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Receipt className="h-5 w-5" />} title="Nothing sold yet" description="Top items appear once orders complete in this range." />
          )}
        </section>
      </div>

      <section className="panel p-5">
        <h2 className="text-base font-semibold text-ink">Payment methods</h2>
        <p className="mb-4 text-xs text-ink-soft">What customers paid with, this range</p>

        {breakdownLoading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-8 w-full" />)}
          </div>
        ) : paymentBreakdown && paymentBreakdown.length > 0 ? (
          <div className="space-y-3">
            {paymentBreakdown.map((row) => (
              <div key={row.paymentMethodId}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-ink">{row.name}</span>
                  <span className="numeric text-ink-faint">{formatCompactMoney(row.amount)} · {row.count}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                  <div
                    className="h-full rounded-full bg-ember"
                    style={{ width: `${Math.max(4, (row.amount / maxPaymentAmount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="No payments yet" description="Breakdown appears once a bill is paid in this range." />
        )}
      </section>
    </div>
  );
}

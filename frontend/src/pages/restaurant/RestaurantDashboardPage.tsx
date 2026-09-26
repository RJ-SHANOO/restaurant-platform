import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, LayoutGrid, Receipt, TrendingUp, Users, Utensils } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import clsx from 'clsx';
import { apiGet } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { StatCard } from '@/components/ui/StatCard';
import { StatCardSkeleton } from '@/components/ui/Skeleton';
import { OrderStatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatCompactMoney, formatMoney, formatNumber, formatRelative } from '@/utils/format';
import { useAuth } from '@/context/AuthContext';
import type { DiningTable, Order, TableStatus } from '@/types/api';
import { STATUS_LABEL, STATUS_PILL } from './TablesPage';

export default function RestaurantDashboardPage() {
  const { user, can } = useAuth();

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', 'today'],
    queryFn: () => apiGet<Order[]>(endpoints.orders.list, { perPage: 25 }),
    refetchInterval: 30_000,
  });

  const canViewTables = can('tables.view');

  const { data: tables, isLoading: isLoadingTables } = useQuery({
    queryKey: ['tables'],
    queryFn: () => apiGet<DiningTable[]>(endpoints.tables.list),
    refetchInterval: 15_000,
    enabled: canViewTables,
  });

  const paidOrders = orders?.filter((order) => order.paymentStatus === 'paid') ?? [];
  const netSales = paidOrders.reduce((total, order) => total + order.totals.grandTotal, 0);
  const pendingCount = orders?.filter((order) => order.status === 'pending').length ?? 0;
  const averageTicket = paidOrders.length > 0 ? netSales / paidOrders.length : 0;

  return (
    <div className="space-y-7">
      <header>
        <p className="eyebrow">{user?.scope.restaurantName}</p>
        <h1 className="mt-1.5 text-display-lg text-ink">Today</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Live figures across {user?.scope.branchName ?? 'all branches'}.
        </p>
      </header>

      <section className="grid gap-4 stagger-children sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => <StatCardSkeleton key={index} />)
        ) : (
          <>
            <StatCard
              label="Net sales"
              value={formatCompactMoney(netSales)}
              changePercentage={14.2}
              comparisonLabel="vs yesterday"
              icon={<TrendingUp className="h-4 w-4" />}
              tone="mint"
            />
            <StatCard
              label="Orders"
              value={formatNumber(orders?.length ?? 0)}
              changePercentage={6.8}
              comparisonLabel="vs yesterday"
              icon={<Receipt className="h-4 w-4" />}
              tone="sky"
            />
            <StatCard
              label="Awaiting confirmation"
              value={formatNumber(pendingCount)}
              icon={<Clock className="h-4 w-4" />}
              tone={pendingCount > 0 ? 'ember' : 'sky'}
              footer={pendingCount > 0 ? 'Someone needs to accept these' : 'Counter is clear'}
            />
            <StatCard
              label="Average ticket"
              value={formatCompactMoney(averageTicket)}
              icon={<Utensils className="h-4 w-4" />}
              tone="ember"
            />
          </>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="panel p-5 lg:col-span-3">
          <h2 className="text-base font-semibold text-ink">Sales by hour</h2>
          <p className="mb-5 text-xs text-ink-soft">Where the rush actually falls</p>

          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={HOURLY_PLACEHOLDER}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262E3A" vertical={false} />
                <XAxis dataKey="hour" stroke="#5F6B7A" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#5F6B7A" fontSize={11} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  cursor={{ fill: 'rgba(245,165,36,0.07)' }}
                  contentStyle={{
                    background: '#14181F',
                    border: '1px solid #35404F',
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="sales" fill="#F5A524" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-5 lg:col-span-2">
          <h2 className="text-base font-semibold text-ink">Recent orders</h2>
          <p className="mb-4 text-xs text-ink-soft">Newest first</p>

          {orders && orders.length > 0 ? (
            <ul className="-mx-2 divide-y divide-line">
              {orders.slice(0, 7).map((order) => (
                <li
                  key={order.id}
                  className="flex items-center gap-3 rounded-control px-2 py-3 transition-colors hover:bg-raised"
                >
                  <div className="min-w-0 flex-1">
                    <p className="numeric truncate text-sm font-medium text-ink">
                      {order.orderNumber}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {order.table?.label ?? order.orderType.replace('_', ' ')} ·{' '}
                      {formatRelative(order.timestamps.createdAt)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="numeric text-sm font-semibold text-ink">
                      {formatMoney(order.totals.grandTotal)}
                    </p>
                    <OrderStatusPill status={order.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<Receipt className="h-5 w-5" />}
              title="No orders yet today"
              description="Orders will appear here the moment the counter or a QR table sends one through."
            />
          )}
        </section>
      </div>

      {canViewTables && <FloorMap tables={tables} isLoading={isLoadingTables} />}
    </div>
  );
}

const STATUS_ORDER: TableStatus[] = ['occupied', 'available', 'reserved', 'out_of_service'];

const DOT_TONE: Record<TableStatus, string> = {
  available: 'bg-mint',
  occupied: 'bg-ember',
  reserved: 'bg-sky',
  out_of_service: 'bg-ink-faint',
};

const TILE_TONE: Record<TableStatus, string> = {
  available: 'border-mint/30 bg-mint-soft',
  occupied: 'border-ember/30 bg-ember-soft',
  reserved: 'border-sky/30 bg-sky-soft',
  out_of_service: 'border-line bg-raised',
};

function FloorMap({ tables, isLoading }: { tables: DiningTable[] | undefined; isLoading: boolean }) {
  const counts = (tables ?? []).reduce<Record<string, number>>((acc, table) => {
    acc[table.status] = (acc[table.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Floor map</h2>
          <p className="text-xs text-ink-soft">Live table status - refreshes every 15s</p>
        </div>
        <Link to="/app/tables" className="text-xs font-medium text-ember hover:underline">
          Manage tables
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-[76px] w-full" />
          ))}
        </div>
      ) : tables && tables.length > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap gap-4">
            {STATUS_ORDER.map((status) => (
              <span key={status} className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
                <span className={clsx('h-2 w-2 rounded-full', DOT_TONE[status])} />
                {STATUS_LABEL[status]} · {counts[status] ?? 0}
              </span>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5 stagger-children sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
            {tables.map((table) => (
              <div
                key={table.id}
                title={table.branch?.name ? `${table.branch.name}${table.areaName ? ' · ' + table.areaName : ''}` : undefined}
                className={clsx('rounded-control border p-2.5 text-center', TILE_TONE[table.status])}
              >
                <p className="truncate text-sm font-semibold text-ink">{table.label}</p>
                <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-ink-faint">
                  <Users className="h-3 w-3" /> {table.capacity}
                </p>
                <span className={clsx('pill mt-1.5 inline-flex px-1.5 py-0.5 text-[10px]', STATUS_PILL[table.status])}>
                  {STATUS_LABEL[table.status]}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<LayoutGrid className="h-5 w-5" />}
          title="No tables yet"
          description="Add tables from Tables & QR to see live occupancy here."
        />
      )}
    </section>
  );
}

/* Replaced by GET /reports/sales-by-hour once that endpoint lands. */
const HOURLY_PLACEHOLDER = [
  { hour: '12p', sales: 0 }, { hour: '2p', sales: 0 }, { hour: '4p', sales: 0 },
  { hour: '6p', sales: 0 }, { hour: '8p', sales: 0 }, { hour: '10p', sales: 0 },
];

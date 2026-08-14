import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { apiGet, apiPost, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { OrderStatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { formatMoney, formatRelative, humanise } from '@/utils/format';
import type { Order, OrderStatus } from '@/types/api';

const FILTERS: Array<{ label: string; value: OrderStatus | 'all' }> = [
  { label: 'Live', value: 'all' },
  { label: 'Awaiting', value: 'pending' },
  { label: 'Preparing', value: 'preparing' },
  { label: 'Ready', value: 'ready' },
  { label: 'Completed', value: 'completed' },
];

export default function OrderBoardPage() {
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const queryClient = useQueryClient();

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', filter],
    queryFn: () =>
      apiGet<Order[]>(endpoints.orders.list, {
        ...(filter === 'all' ? { liveOnly: true } : { status: filter }),
        perPage: 40,
      }),
    refetchInterval: 15_000,
  });

  const transition = useMutation({
    mutationFn: ({ orderId, status }: { orderId: number; status: OrderStatus }) =>
      apiPost(endpoints.orders.transition(orderId), { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order updated.');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not update that order.');
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Operations</p>
        <h1 className="mt-1.5 text-display-md text-ink">Orders</h1>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            className={clsx(
              'rounded-pill px-3.5 py-1.5 text-xs font-semibold transition-colors',
              filter === option.value
                ? 'bg-ember text-[#1A1206]'
                : 'bg-raised text-ink-soft hover:bg-hover hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-52 w-full" />
          ))}
        </div>
      ) : orders && orders.length > 0 ? (
        <div className="grid gap-4 stagger-children md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => (
            <article key={order.id} className="panel-interactive flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="numeric text-base font-bold text-ink">{order.orderNumber}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {order.table?.label ?? humanise(order.orderType)} ·{' '}
                    {formatRelative(order.timestamps.createdAt)}
                  </p>
                </div>
                <OrderStatusPill status={order.status} />
              </div>

              {order.items && order.items.length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
                  {order.items.slice(0, 4).map((item) => (
                    <li key={item.id} className="flex justify-between gap-3 text-ink-soft">
                      <span className="truncate">
                        <span className="numeric text-ember">{item.billableQuantity}×</span>{' '}
                        {item.productName}
                      </span>
                      <span className="numeric shrink-0">{formatMoney(item.lineTotal)}</span>
                    </li>
                  ))}
                  {order.items.length > 4 && (
                    <li className="text-xs text-ink-faint">
                      +{order.items.length - 4} more
                    </li>
                  )}
                </ul>
              )}

              <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-4">
                <div>
                  <p className="eyebrow">Total</p>
                  <p className="numeric text-xl font-semibold text-ink">
                    {formatMoney(order.totals.grandTotal)}
                  </p>
                </div>

                {order.allowedNextStatuses.length > 0 && (
                  <Button
                    size="sm"
                    variant={order.status === 'pending' ? 'primary' : 'secondary'}
                    isLoading={transition.isPending && transition.variables?.orderId === order.id}
                    onClick={() =>
                      transition.mutate({
                        orderId: order.id,
                        status: order.allowedNextStatuses[0],
                      })
                    }
                  >
                    {humanise(order.allowedNextStatuses[0])}
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title="Nothing on the board"
          description="New orders from the counter, a QR table or the website will show up here automatically."
        />
      )}
    </div>
  );
}

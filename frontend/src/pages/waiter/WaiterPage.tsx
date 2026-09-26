import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Minus,
  Plus,
  Receipt as ReceiptIcon,
  Search,
  ShoppingCart,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { apiGet, apiPost, ApiError, isConnectivityError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { OrderStatusPill, PendingSyncPill } from '@/components/ui/StatusPill';
import { useAuth } from '@/context/AuthContext';
import { formatMoney, humanise } from '@/utils/format';
import { BillModal, BILLABLE_STATUSES } from '@/pages/restaurant/OrderBoardPage';
import type { DiningTable, MenuProduct, Order, PaymentMethodConfig, TableStatus } from '@/types/api';

interface CartLine {
  product: MenuProduct;
  quantity: number;
}

/** Shape menu/products actually returns - basePrice, not price. */
interface CatalogProduct {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePrice: number;
  preparationMinutes: number;
  isAvailable: boolean;
  isFeatured: boolean;
  category?: { id: number; name: string } | null;
}

function toMenuProduct(product: CatalogProduct): MenuProduct {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.basePrice,
    imageUrl: product.imageUrl,
    isFeatured: product.isFeatured,
    isAvailable: product.isAvailable,
    prepMinutes: product.preparationMinutes,
    category: product.category ?? undefined,
  };
}

const TABLE_STATUS_PILL: Record<TableStatus, string> = {
  available: 'pill-mint',
  occupied: 'pill-ember',
  reserved: 'pill-sky',
  out_of_service: 'pill-muted',
};

/**
 * The waiter's tablet screen.
 *
 * Everything a QR-scanning customer could do for themselves - browse the
 * menu, order, pick how they'll pay - a waiter can do on their behalf here by
 * picking the table first. Everything else a waiter does without this
 * screen - bringing the bill, marking a table served, taking payment - is
 * on the same screen too, so there's nowhere else they need to go.
 */
export default function WaiterPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [composeTable, setComposeTable] = useState<DiningTable | null>(null);
  const [billingOrder, setBillingOrder] = useState<Order | null>(null);

  const { data: tables, isLoading: tablesLoading } = useQuery({
    queryKey: ['waiter', 'tables'],
    queryFn: () => apiGet<DiningTable[]>(endpoints.tables.list),
  });

  const { data: liveOrders } = useQuery({
    queryKey: ['waiter', 'live-orders'],
    queryFn: () => apiGet<Order[]>(endpoints.orders.list, { liveOnly: true, perPage: 100 }),
    refetchInterval: 10_000,
  });

  const ordersByTable = useMemo(() => {
    const map = new Map<number, Order[]>();
    for (const order of liveOrders ?? []) {
      if (!order.table) continue;
      const list = map.get(order.table.id) ?? [];
      list.push(order);
      map.set(order.table.id, list);
    }
    return map;
  }, [liveOrders]);

  const markServed = useMutation({
    mutationFn: (orderId: number) => apiPost(endpoints.orders.transition(orderId), { status: 'served' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waiter', 'live-orders'] });
      toast.success('Marked served.');
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not update that order.'),
  });

  if (composeTable) {
    return (
      <OrderComposer
        table={composeTable}
        onBack={() => setComposeTable(null)}
        onPlaced={() => {
          setComposeTable(null);
          queryClient.invalidateQueries({ queryKey: ['waiter', 'live-orders'] });
        }}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      {tablesLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      ) : tables && tables.length > 0 ? (
        <div className="grid gap-4 stagger-children md:grid-cols-2 xl:grid-cols-3">
          {tables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              orders={ordersByTable.get(table.id) ?? []}
              canUpdateStatus={can('orders.updateStatus')}
              canBill={can('billing.issue')}
              onStartOrder={() => setComposeTable(table)}
              onMarkServed={(orderId) => markServed.mutate(orderId)}
              onBill={(order) => setBillingOrder(order)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No tables yet"
          description="Ask a manager to add tables from Tables & QR."
        />
      )}

      <BillModal
        order={billingOrder}
        onClose={() => setBillingOrder(null)}
        onSettled={() => queryClient.invalidateQueries({ queryKey: ['waiter', 'live-orders'] })}
      />
    </div>
  );
}

function TableCard({
  table,
  orders,
  canUpdateStatus,
  canBill,
  onStartOrder,
  onMarkServed,
  onBill,
}: {
  table: DiningTable;
  orders: Order[];
  canUpdateStatus: boolean;
  canBill: boolean;
  onStartOrder: () => void;
  onMarkServed: (orderId: number) => void;
  onBill: (order: Order) => void;
}) {
  return (
    <article className="panel-interactive flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-base font-semibold text-ink">{table.label}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-faint">
            <Users className="h-3.5 w-3.5" /> Seats {table.capacity}
          </p>
        </div>
        <span className={clsx('pill shrink-0', TABLE_STATUS_PILL[table.status])}>
          <span className="status-dot" />
          {table.status === 'available' ? 'Free' : humanise(table.status)}
        </span>
      </div>

      {orders.length === 0 ? (
        <button
          onClick={onStartOrder}
          className="mt-1 flex items-center justify-center gap-2 rounded-control border border-dashed border-line-strong bg-raised py-3 text-xs font-medium text-ink-soft transition-colors hover:border-ember/50 hover:text-ember"
        >
          <Plus className="h-4 w-4" /> Take order
        </button>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const showServe = canUpdateStatus && order.allowedNextStatuses.includes('served');
            const showBill =
              canBill && BILLABLE_STATUSES.includes(order.status) && order.paymentStatus !== 'paid';

            return (
              <div key={order.id} className="rounded-control bg-raised p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <OrderStatusPill status={order.status} />
                  <span className="numeric text-sm font-semibold text-ink">
                    {formatMoney(order.totals.grandTotal)}
                  </span>
                </div>

                {(showServe || showBill) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {showServe && (
                      <Button size="sm" variant="secondary" onClick={() => onMarkServed(order.id)}>
                        Mark served
                      </Button>
                    )}
                    {showBill && (
                      <Button size="sm" onClick={() => onBill(order)}>
                        <ReceiptIcon className="h-3.5 w-3.5" /> Bill
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={onStartOrder}
            className="w-full rounded-control border border-dashed border-line-strong py-2 text-xs font-medium text-ink-faint transition-colors hover:border-ember/50 hover:text-ember"
          >
            + Add another order
          </button>
        </div>
      )}
    </article>
  );
}

/**
 * Taking an order for a table the way a QR-scanning customer would: browse,
 * build a cart, say how they'll pay, send it. The order is created exactly
 * the way the counter's own POS creates one - the only difference is the
 * table is picked by the waiter instead of coming from a scanned code.
 */
function OrderComposer({
  table,
  onBack,
  onPlaced,
}: {
  table: DiningTable;
  onBack: () => void;
  onPlaced: () => void;
}) {
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);
  // Set when the last send failed to reach the server at all - kept as a
  // safe-to-retry state, same as the POS terminal's cart.
  const [pendingSync, setPendingSync] = useState(false);

  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const { data: products } = useQuery({
    queryKey: ['waiter', 'menu'],
    queryFn: async () => {
      const items = await apiGet<CatalogProduct[]>(endpoints.menu.products, { isAvailable: true });
      return items.map(toMenuProduct);
    },
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ['payment-methods', 'active'],
    queryFn: () => apiGet<PaymentMethodConfig[]>(endpoints.paymentMethods.list, { perPage: 50 }),
  });

  const activeMethods = paymentMethods?.filter((method) => method.isActive) ?? [];

  const filtered = useMemo(() => {
    if (!products) return [];
    const term = search.trim().toLowerCase();
    return term ? products.filter((product) => product.name.toLowerCase().includes(term)) : products;
  }, [products, search]);

  const subtotal = cart.reduce((total, line) => total + line.product.price * line.quantity, 0);

  const addToCart = (product: MenuProduct) => {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);

      return existing
        ? current.map((line) =>
            line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line,
          )
        : [...current, { product, quantity: 1 }];
    });
  };

  const changeQuantity = (productId: number, delta: number) => {
    setCart((current) =>
      current
        .map((line) =>
          line.product.id === productId
            ? { ...line, quantity: Math.max(0, line.quantity + delta) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  };

  const placeOrder = useMutation({
    mutationFn: () =>
      apiPost<Order>(endpoints.orders.list, {
        branchId: table.branchId,
        diningTableId: table.id,
        orderType: 'dine_in',
        idempotencyKey: idempotencyKeyRef.current,
        preferredPaymentMethodId: paymentMethodId ?? undefined,
        items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
      }),
    onSuccess: (order) => {
      toast.success(`Order ${order.orderNumber} sent for ${table.label}.`);
      setPendingSync(false);
      idempotencyKeyRef.current = crypto.randomUUID();
      onPlaced();
    },
    onError: (error) => {
      if (isConnectivityError(error)) {
        setPendingSync(true);
        toast.error('No connection. The order is kept here - tap Send order again once you are back online.');
      } else {
        setPendingSync(false);
        toast.error(error instanceof ApiError ? error.message : 'Could not place that order.');
      }
    },
  });

  return (
    <div className="flex h-full">
      <section className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line p-4">
          <button onClick={onBack} className="btn btn-ghost" aria-label="Back to tables">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="text-xs text-ink-faint">Ordering for</p>
            <p className="truncate text-sm font-semibold text-ink">{table.label}</p>
          </div>
          <div className="ml-auto w-56">
            <TextField
              placeholder="Search the menu"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              leadingIcon={<Search className="h-4 w-4" />}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length > 0 ? (
            <div className="grid gap-3 stagger-children grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {filtered.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={!product.isAvailable}
                  className={clsx(
                    'panel-interactive flex flex-col p-3.5 text-left',
                    !product.isAvailable && 'pointer-events-none opacity-40',
                  )}
                >
                  <span className="line-clamp-2 text-sm font-medium leading-snug text-ink">
                    {product.name}
                  </span>
                  <span className="numeric mt-auto pt-3 text-base font-semibold text-ember">
                    {formatMoney(product.price)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Search className="h-6 w-6" />}
              title="No dishes match"
              description="Clear the search, or ask a manager to add items to the menu."
            />
          )}
        </div>
      </section>

      <aside
        className={clsx(
          'flex w-full max-w-[380px] flex-col border-l border-line bg-panel',
          'fixed inset-y-0 right-0 z-30 transition-transform duration-300 lg:static lg:translate-x-0',
          isCartOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm font-semibold text-ink">{table.label}'s order</h2>
            {pendingSync && <PendingSyncPill />}
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => {
                setCart([]);
                setPendingSync(false);
              }}
              className="btn btn-ghost text-xs"
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-3">
          {cart.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-ink-faint">
              Tap a dish to start the order.
            </p>
          ) : (
            <ul className="space-y-2">
              {cart.map((line) => (
                <li key={line.product.id} className="rounded-control bg-raised p-3 animate-slide-in-right">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium leading-snug text-ink">
                      {line.product.name}
                    </span>
                    <span className="numeric shrink-0 text-sm font-semibold text-ink">
                      {formatMoney(line.product.price * line.quantity)}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      onClick={() => changeQuantity(line.product.id, -1)}
                      className="rounded-control bg-void p-1.5 text-ink-soft transition-colors hover:text-chili"
                      aria-label="Reduce quantity"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="numeric w-8 text-center text-sm font-semibold text-ink">
                      {line.quantity}
                    </span>
                    <button
                      onClick={() => changeQuantity(line.product.id, 1)}
                      className="rounded-control bg-void p-1.5 text-ink-soft transition-colors hover:text-ember"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="space-y-3 border-t border-line p-4 safe-bottom">
          {activeMethods.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-faint">Customer will pay with</p>
              <div className="flex flex-wrap gap-1.5">
                {activeMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => setPaymentMethodId(method.id)}
                    className={clsx('pill', paymentMethodId === method.id ? 'pill-ember' : 'pill-muted')}
                  >
                    {method.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between text-sm text-ink-soft">
            <span>Subtotal</span>
            <span className="numeric">{formatMoney(subtotal)}</span>
          </div>
          <p className="text-xs text-ink-faint">
            {pendingSync
              ? 'No connection reached the server. Nothing was lost - tap Send order again once you are back online.'
              : 'Tax and service charge shown here are an estimate. The binding rate is resolved when the bill is issued.'}
          </p>

          <Button
            size="lg"
            className="w-full"
            disabled={cart.length === 0}
            isLoading={placeOrder.isPending}
            onClick={() => placeOrder.mutate()}
          >
            Send order
          </Button>
        </footer>
      </aside>

      {cart.length > 0 && !isCartOpen && (
        <button
          onClick={() => setIsCartOpen(true)}
          className="btn btn-primary fixed bottom-5 right-5 z-20 shadow-lifted lg:hidden"
        >
          <ShoppingCart className="h-4 w-4" />
          <span className="numeric">{cart.length}</span> · {formatMoney(subtotal)}
        </button>
      )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, CreditCard, Minus, Plus, QrCode, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { formatMoney } from '@/utils/format';
import { resolveSiteTheme } from '@/utils/siteTheme';
import type { MenuProduct } from '@/types/api';

interface QrTheme {
  primaryColor: string;
  secondaryColor: string;
  backgroundShade: string;
  fontFamily: string;
  logoUrl: string | null;
}

interface QrMenuCategory {
  id: number;
  name: string;
  products: MenuProduct[];
}

interface QrPaymentMethod {
  id: number;
  name: string;
  kind: string;
}

interface QrContext {
  restaurant: { name: string; slug: string; currencyCode: string; theme: QrTheme | null };
  branch: { id: number; name: string };
  table: { label: string; capacity: number };
  paymentMethods: QrPaymentMethod[];
  menu: QrMenuCategory[];
}

interface QrOrderStatus {
  orderNumber: string;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled' | 'voided';
  placedAt: string;
  estimatedReadyAt: string | null;
  preferredPaymentMethod: QrPaymentMethod | null;
  grandTotal: number;
  invoice: {
    invoiceNumber: string;
    status: string;
    grandTotal: number;
    paidAmount: number;
    paidVia: string | null;
  } | null;
}

const STATUS_COPY: Record<QrOrderStatus['status'], string> = {
  pending: 'Confirming your order',
  confirmed: 'The kitchen has your order',
  preparing: 'Being prepared',
  ready: 'Ready - on its way to your table',
  served: 'Served. Enjoy your meal',
  completed: 'Completed',
  cancelled: 'This order was cancelled',
  voided: 'This order was voided',
};

const DEFAULT_THEME: QrTheme = {
  primaryColor: '#F5A524',
  secondaryColor: '#3DD68C',
  backgroundShade: 'dark',
  fontFamily: 'Inter',
  logoUrl: null,
};

// Mirrors backend/src/services/orderService.ts's APPENDABLE_STATUSES - once an
// order is completed, cancelled or voided, the "add more items" button should
// not even offer something the server would refuse.
const APPENDABLE_STATUSES: QrOrderStatus['status'][] = [
  'pending', 'confirmed', 'preparing', 'ready', 'served',
];

/**
 * The product list a guest scrolls through, with +/- quantity controls.
 * Shared by the initial order screen and by "add more items" on an order
 * already placed, so the two can never drift into looking different.
 */
function ProductList({
  menu,
  quantities,
  onChangeQuantity,
  theme,
  colors,
  currencyCode,
}: {
  menu: QrMenuCategory[];
  quantities: Record<number, number>;
  onChangeQuantity: (productId: number, quantity: number) => void;
  theme: QrTheme;
  colors: { text: string; muted: string; surface: string; onPrimary: string };
  currencyCode: string;
}) {
  const { text, muted, surface, onPrimary } = colors;

  return (
    <div className="space-y-8">
      {menu.map((category) => (
        <section key={category.id}>
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-[0.16em]"
            style={{ color: muted }}
          >
            {category.name}
          </h2>

          <ul className="space-y-2.5">
            {category.products.map((product) => {
              const quantity = quantities[product.id] ?? 0;

              return (
                <li
                  key={product.id}
                  className="flex items-center gap-4 rounded-lg p-4"
                  style={{ background: surface }}
                >
                  {product.imageUrl && (
                    <img
                      src={product.imageUrl}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-lg object-cover"
                    />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium" style={{ color: text }}>{product.name}</p>
                    {product.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: muted }}>
                        {product.description}
                      </p>
                    )}
                    <p className="numeric mt-1.5 text-sm font-semibold" style={{ color: theme.primaryColor }}>
                      {formatMoney(product.price, currencyCode)}
                    </p>
                  </div>

                  {quantity === 0 ? (
                    <button
                      onClick={() => onChangeQuantity(product.id, 1)}
                      className="shrink-0 rounded-lg px-3 py-2.5"
                      style={{ background: `${theme.primaryColor}22`, color: theme.primaryColor }}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  ) : (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => onChangeQuantity(product.id, Math.max(0, quantity - 1))}
                        className="rounded-lg p-2"
                        style={{ background: `${theme.primaryColor}15`, color: text }}
                        aria-label="Remove one"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="numeric w-6 text-center font-semibold" style={{ color: text }}>
                        {quantity}
                      </span>
                      <button
                        onClick={() => onChangeQuantity(product.id, quantity + 1)}
                        className="rounded-lg p-2"
                        style={{ background: theme.primaryColor, color: onPrimary }}
                        aria-label="Add one"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * What a customer sees after scanning the QR on their table.
 *
 * The table is never asked for and never entered - it comes from the token in
 * the URL. That is the whole point of the flow: the guest scans, browses and
 * orders without typing anything a mistake could get wrong.
 *
 * Styled from the restaurant's own theme, not this app's dark saffron
 * palette: the guest is a customer of the restaurant, not a user of this
 * platform, and should never see the platform's own colours.
 */
export default function QrMenuPage() {
  const { qrToken = '' } = useParams();
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [placedOrderNumber, setPlacedOrderNumber] = useState<string | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['qr', qrToken],
    queryFn: () => apiGet<QrContext>(endpoints.publicSite.resolveTable(qrToken)),
    retry: false,
  });

  useEffect(() => {
    if (!paymentMethodId && data?.paymentMethods.length) {
      setPaymentMethodId(data.paymentMethods[0].id);
    }
  }, [data, paymentMethodId]);

  const theme = data?.restaurant.theme ?? DEFAULT_THEME;
  const { background, text, muted, surface, onPrimary } = resolveSiteTheme(theme.backgroundShade);

  const allProducts = useMemo(
    () => data?.menu.flatMap((category) => category.products) ?? [],
    [data],
  );

  const cartTotal = useMemo(
    () =>
      Object.entries(quantities).reduce((total, [productId, quantity]) => {
        const product = allProducts.find((item) => item.id === Number(productId));
        return total + (product?.price ?? 0) * quantity;
      }, 0),
    [quantities, allProducts],
  );

  const itemCount = Object.values(quantities).reduce((total, quantity) => total + quantity, 0);

  // One key per order attempt: a retry (a shaky connection, a double tap)
  // must replay under the same key, not a fresh one that would let the
  // guest's table end up with the same order twice.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const placeOrder = useMutation({
    mutationFn: () =>
      apiPost<{ orderNumber: string }>(endpoints.publicSite.placeOrder(qrToken), {
        idempotencyKey: idempotencyKeyRef.current,
        preferredPaymentMethodId: paymentMethodId ?? undefined,
        items: Object.entries(quantities)
          .filter(([, quantity]) => quantity > 0)
          .map(([productId, quantity]) => ({ productId: Number(productId), quantity })),
      }),
    onSuccess: (result) => {
      setPlacedOrderNumber(result.orderNumber);
      setQuantities({});
      idempotencyKeyRef.current = crypto.randomUUID();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not send that order.'),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ember" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <QrCode className="h-10 w-10 text-ink-faint" />
        <h1 className="mt-5 text-display-md text-ink">This code is not active</h1>
        <p className="mt-2 max-w-xs text-sm text-ink-soft">
          Ask a member of staff for a current code, or order at the counter.
        </p>
      </div>
    );
  }

  if (placedOrderNumber) {
    return (
      <OrderTrackingScreen
        qrToken={qrToken}
        orderNumber={placedOrderNumber}
        tableLabel={data.table.label}
        currencyCode={data.restaurant.currencyCode}
        theme={theme}
        colors={{ background, text, muted, surface, onPrimary }}
        menu={data.menu}
        onReset={() => setPlacedOrderNumber(null)}
      />
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ background, color: text, fontFamily: theme.fontFamily }}>
      <header className="px-5 py-6" style={{ background: surface }}>
        {theme.logoUrl && <img src={theme.logoUrl} alt="" className="mb-2 h-9 w-9 rounded-lg object-cover" />}
        <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: theme.primaryColor }}>
          {data.branch.name}
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold">{data.restaurant.name}</h1>
        <p className="mt-1 text-sm" style={{ color: muted }}>
          You are at <span className="font-medium" style={{ color: theme.primaryColor }}>{data.table.label}</span>
        </p>
      </header>

      <main className="px-5 py-6">
        <ProductList
          menu={data.menu}
          quantities={quantities}
          onChangeQuantity={(productId, quantity) =>
            setQuantities((current) => ({ ...current, [productId]: quantity }))
          }
          theme={theme}
          colors={{ text, muted, surface, onPrimary }}
          currencyCode={data.restaurant.currencyCode}
        />
      </main>

      {itemCount > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 p-4 backdrop-blur-lg safe-bottom animate-rise-in"
          style={{ background: `${surface}`, borderTop: `1px solid ${theme.primaryColor}22` }}
        >
          {data.paymentMethods.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-medium" style={{ color: muted }}>
                Pay with, when the bill comes
              </p>
              <div className="flex flex-wrap gap-2">
                {data.paymentMethods.map((method) => {
                  const selected = paymentMethodId === method.id;
                  return (
                    <button
                      key={method.id}
                      onClick={() => setPaymentMethodId(method.id)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium"
                      style={
                        selected
                          ? { background: theme.primaryColor, color: onPrimary }
                          : { background: `${theme.primaryColor}15`, color: text }
                      }
                    >
                      {method.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <button
            onClick={() => placeOrder.mutate()}
            disabled={placeOrder.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold disabled:opacity-60"
            style={{ background: theme.primaryColor, color: onPrimary }}
          >
            <ShoppingBag className="h-4 w-4" />
            Send {itemCount} {itemCount === 1 ? 'item' : 'items'} ·{' '}
            <span className="numeric">{formatMoney(cartTotal, data.restaurant.currencyCode)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * What the guest sees after sending an order: live status, a rough countdown
 * to when the kitchen expects it ready, and - once the waiter issues the
 * bill - what to pay and with which method.
 */
function OrderTrackingScreen({
  qrToken,
  orderNumber,
  tableLabel,
  currencyCode,
  theme,
  colors,
  menu,
  onReset,
}: {
  qrToken: string;
  orderNumber: string;
  tableLabel: string;
  currencyCode: string;
  theme: QrTheme;
  colors: { background: string; text: string; muted: string; surface: string; onPrimary: string };
  menu: QrMenuCategory[];
  onReset: () => void;
}) {
  const { background, text, muted, surface, onPrimary } = colors;
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<'tracking' | 'adding'>('tracking');
  const [addQuantities, setAddQuantities] = useState<Record<number, number>>({});
  const queryClient = useQueryClient();

  const { data: order } = useQuery({
    queryKey: ['qr-order-status', qrToken, orderNumber],
    queryFn: () => apiGet<QrOrderStatus>(endpoints.publicSite.orderStatus(qrToken, orderNumber)),
    refetchInterval: 6000,
  });

  const allProducts = useMemo(() => menu.flatMap((category) => category.products), [menu]);

  const addItemCount = Object.values(addQuantities).reduce((total, quantity) => total + quantity, 0);

  const addCartTotal = Object.entries(addQuantities).reduce((total, [productId, quantity]) => {
    const product = allProducts.find((item) => item.id === Number(productId));
    return total + (product?.price ?? 0) * quantity;
  }, 0);

  const addItems = useMutation({
    mutationFn: () =>
      apiPost<{ orderNumber: string }>(endpoints.publicSite.addOrderItems(qrToken, orderNumber), {
        items: Object.entries(addQuantities)
          .filter(([, quantity]) => quantity > 0)
          .map(([productId, quantity]) => ({ productId: Number(productId), quantity })),
      }),
    onSuccess: () => {
      setAddQuantities({});
      setMode('tracking');
      toast.success('Added to your order.');
      queryClient.invalidateQueries({ queryKey: ['qr-order-status', qrToken, orderNumber] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not add those items.'),
  });

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const remainingSeconds = order?.estimatedReadyAt
    ? Math.max(0, Math.round((new Date(order.estimatedReadyAt).getTime() - now) / 1000))
    : null;

  const remainingLabel =
    remainingSeconds === null
      ? null
      : remainingSeconds === 0
        ? 'Any moment now'
        : `About ${Math.ceil(remainingSeconds / 60)} min left`;

  const payVia = order?.invoice?.paidVia ?? order?.preferredPaymentMethod?.name ?? null;

  const canAddItems = Boolean(order) && !order?.invoice && APPENDABLE_STATUSES.includes(order!.status);

  if (mode === 'adding') {
    return (
      <div className="min-h-screen pb-28" style={{ background, color: text, fontFamily: theme.fontFamily }}>
        <header className="px-5 py-6" style={{ background: surface }}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: theme.primaryColor }}>
            {orderNumber}
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold">Add more items</h1>
          <p className="mt-1 text-sm" style={{ color: muted }}>
            These go on the same bill for {tableLabel}.
          </p>
        </header>

        <main className="px-5 py-6">
          <ProductList
            menu={menu}
            quantities={addQuantities}
            onChangeQuantity={(productId, quantity) =>
              setAddQuantities((current) => ({ ...current, [productId]: quantity }))
            }
            theme={theme}
            colors={{ text, muted, surface, onPrimary }}
            currencyCode={currencyCode}
          />
        </main>

        <div
          className="fixed inset-x-0 bottom-0 flex gap-2 p-4 backdrop-blur-lg safe-bottom animate-rise-in"
          style={{ background: surface, borderTop: `1px solid ${theme.primaryColor}22` }}
        >
          <button
            onClick={() => {
              setAddQuantities({});
              setMode('tracking');
            }}
            className="rounded-lg px-4 py-3 text-sm font-semibold"
            style={{ background: `${theme.primaryColor}15`, color: text }}
          >
            Back
          </button>
          <button
            onClick={() => addItems.mutate()}
            disabled={addItemCount === 0 || addItems.isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold disabled:opacity-60"
            style={{ background: theme.primaryColor, color: onPrimary }}
          >
            <ShoppingBag className="h-4 w-4" />
            Add {addItemCount} {addItemCount === 1 ? 'item' : 'items'} ·{' '}
            <span className="numeric">{formatMoney(addCartTotal, currencyCode)}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center px-6 pb-10 pt-14 text-center animate-rise-in"
      style={{ background, color: text, fontFamily: theme.fontFamily }}
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: `${theme.secondaryColor}22` }}
      >
        <Check className="h-7 w-7" style={{ color: theme.secondaryColor }} />
      </span>
      <h1 className="mt-5 text-2xl font-semibold">Order sent</h1>
      <p className="numeric mt-2 text-lg" style={{ color: theme.primaryColor }}>{orderNumber}</p>
      <p className="mt-3 max-w-xs text-sm" style={{ color: muted }}>
        Coming to {tableLabel}.
      </p>

      <div className="mt-6 w-full max-w-xs rounded-lg p-4 text-left" style={{ background: surface }}>
        <p className="text-sm font-semibold">{order ? STATUS_COPY[order.status] : 'Confirming your order'}</p>

        {remainingLabel && !['served', 'completed', 'cancelled', 'voided'].includes(order?.status ?? '') && (
          <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: muted }}>
            <Clock className="h-3.5 w-3.5" style={{ color: theme.primaryColor }} />
            {remainingLabel}
          </p>
        )}

        {payVia && (
          <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: muted }}>
            <CreditCard className="h-3.5 w-3.5" style={{ color: theme.primaryColor }} />
            {order?.invoice ? `Paying via ${payVia}` : `Will pay via ${payVia}`}
          </p>
        )}

        {order?.invoice && (
          <p className="mt-3 border-t pt-3 text-sm" style={{ borderColor: `${theme.primaryColor}22` }}>
            Bill {order.invoice.invoiceNumber} ·{' '}
            <span className="numeric font-semibold" style={{ color: theme.primaryColor }}>
              {formatMoney(order.invoice.grandTotal, currencyCode)}
            </span>{' '}
            {order.invoice.status === 'paid' ? '· Paid' : '· Awaiting payment'}
          </p>
        )}
      </div>

      {canAddItems ? (
        <button
          onClick={() => setMode('adding')}
          className="mt-6 rounded-lg px-4 py-2.5 text-sm font-semibold"
          style={{ background: theme.primaryColor, color: onPrimary }}
        >
          Add more items
        </button>
      ) : (
        <button
          onClick={onReset}
          className="mt-6 rounded-lg px-4 py-2.5 text-sm font-semibold"
          style={{ background: surface, color: text }}
        >
          Order something else
        </button>
      )}
    </div>
  );
}

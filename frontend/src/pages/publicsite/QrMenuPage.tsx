import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Minus, Plus, QrCode, ShoppingBag } from 'lucide-react';
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

interface QrContext {
  restaurant: { name: string; slug: string; currencyCode: string; theme: QrTheme | null };
  branch: { id: number; name: string };
  table: { label: string; capacity: number };
  menu: QrMenuCategory[];
}

const DEFAULT_THEME: QrTheme = {
  primaryColor: '#F5A524',
  secondaryColor: '#3DD68C',
  backgroundShade: 'dark',
  fontFamily: 'Inter',
  logoUrl: null,
};

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

  const { data, isLoading, isError } = useQuery({
    queryKey: ['qr', qrToken],
    queryFn: () => apiGet<QrContext>(endpoints.publicSite.resolveTable(qrToken)),
    retry: false,
  });

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
      <div
        className="flex min-h-screen flex-col items-center justify-center px-6 text-center animate-rise-in"
        style={{ background, color: text, fontFamily: theme.fontFamily }}
      >
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: `${theme.secondaryColor}22` }}
        >
          <Check className="h-7 w-7" style={{ color: theme.secondaryColor }} />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">Order sent</h1>
        <p className="numeric mt-2 text-lg" style={{ color: theme.primaryColor }}>{placedOrderNumber}</p>
        <p className="mt-3 max-w-xs text-sm" style={{ color: muted }}>
          The counter is confirming it now. Your food will come to {data.table.label}.
        </p>
        <button
          onClick={() => setPlacedOrderNumber(null)}
          className="mt-6 rounded-lg px-4 py-2.5 text-sm font-semibold"
          style={{ background: surface, color: text }}
        >
          Order something else
        </button>
      </div>
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

      <main className="space-y-8 px-5 py-6">
        {data.menu.map((category) => (
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
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{product.name}</p>
                      {product.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: muted }}>
                          {product.description}
                        </p>
                      )}
                      <p className="numeric mt-1.5 text-sm font-semibold" style={{ color: theme.primaryColor }}>
                        {formatMoney(product.price, data.restaurant.currencyCode)}
                      </p>
                    </div>

                    {quantity === 0 ? (
                      <button
                        onClick={() => setQuantities((current) => ({ ...current, [product.id]: 1 }))}
                        className="shrink-0 rounded-lg px-3 py-2.5"
                        style={{ background: `${theme.primaryColor}22`, color: theme.primaryColor }}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    ) : (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() =>
                            setQuantities((current) => ({
                              ...current,
                              [product.id]: Math.max(0, quantity - 1),
                            }))
                          }
                          className="rounded-lg p-2"
                          style={{ background: `${theme.primaryColor}15`, color: text }}
                          aria-label="Remove one"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="numeric w-6 text-center font-semibold">{quantity}</span>
                        <button
                          onClick={() =>
                            setQuantities((current) => ({ ...current, [product.id]: quantity + 1 }))
                          }
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
      </main>

      {itemCount > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 p-4 backdrop-blur-lg safe-bottom animate-rise-in"
          style={{ background: `${surface}`, borderTop: `1px solid ${theme.primaryColor}22` }}
        >
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

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, Search, ShoppingCart, Trash2, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { apiGet, apiPost, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatMoney } from '@/utils/format';
import { useAuth } from '@/context/AuthContext';
import type { MenuProduct, Order } from '@/types/api';

interface CartLine {
  product: MenuProduct;
  quantity: number;
  kitchenNote?: string;
}

/**
 * The counter screen.
 *
 * Two panes on desktop, a slide-over cart on tablet. Totals shown here are an
 * optimistic preview only - the authoritative figures come back from the API
 * once the order is created, because tax and service charge are branch
 * settings the client does not own.
 */
export default function PosTerminalPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const { data: products } = useQuery({
    queryKey: ['pos', 'menu'],
    queryFn: () => apiGet<MenuProduct[]>('/products', { perPage: 200 }),
  });

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
        branchId: user?.scope.branchId,
        orderType: 'dine_in',
        // A fresh key per submission: replaying it can never double-charge.
        idempotencyKey: crypto.randomUUID(),
        items: cart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          kitchenNote: line.kitchenNote,
        })),
      }),
    onSuccess: (order) => {
      toast.success(`Order ${order.orderNumber} sent to the counter queue.`);
      setCart([]);
      setIsCartOpen(false);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not place that order.'),
  });

  return (
    <div className="flex h-full">
      {/* ------------------------------------------------------- menu pane */}
      <section className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-line p-4">
          <TextField
            placeholder="Search the menu"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leadingIcon={<Search className="h-4 w-4" />}
          />
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
              icon={<UtensilsCrossed className="h-6 w-6" />}
              title="No dishes match"
              description="Clear the search, or add items to the menu from the back office."
            />
          )}
        </div>
      </section>

      {/* ------------------------------------------------------- cart pane */}
      <aside
        className={clsx(
          'flex w-full max-w-[380px] flex-col border-l border-line bg-panel',
          'fixed inset-y-0 right-0 z-30 transition-transform duration-300 lg:static lg:translate-x-0',
          isCartOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3.5">
          <h2 className="font-display text-sm font-semibold text-ink">Current order</h2>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
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
          <div className="flex justify-between text-sm text-ink-soft">
            <span>Subtotal</span>
            <span className="numeric">{formatMoney(subtotal)}</span>
          </div>
          <p className="text-xs text-ink-faint">
            Tax and service charge are applied by the branch when the order is created.
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

      {/* Mobile cart trigger */}
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

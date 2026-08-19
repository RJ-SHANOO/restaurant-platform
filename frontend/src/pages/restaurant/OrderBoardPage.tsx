import { useEffect, useState } from 'react';
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
import { Modal } from '@/components/ui/Modal';
import { TextField } from '@/components/ui/TextField';
import { formatMoney, formatRelative, humanise } from '@/utils/format';
import type { Invoice, Order, OrderStatus, PaymentMethodConfig } from '@/types/api';

// A bill can only be issued once the kitchen has produced the food.
const BILLABLE_STATUSES: OrderStatus[] = ['ready', 'served', 'completed'];

const FILTERS: Array<{ label: string; value: OrderStatus | 'all' }> = [
  { label: 'Live', value: 'all' },
  { label: 'Awaiting', value: 'pending' },
  { label: 'Preparing', value: 'preparing' },
  { label: 'Ready', value: 'ready' },
  { label: 'Completed', value: 'completed' },
];

export default function OrderBoardPage() {
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [billingOrder, setBillingOrder] = useState<Order | null>(null);
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

                <div className="flex items-center gap-2">
                  {BILLABLE_STATUSES.includes(order.status) && order.paymentStatus !== 'paid' && (
                    <Button size="sm" variant="secondary" onClick={() => setBillingOrder(order)}>
                      <Receipt className="h-3.5 w-3.5" /> Bill
                    </Button>
                  )}

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

      <BillModal
        order={billingOrder}
        onClose={() => setBillingOrder(null)}
        onSettled={() => queryClient.invalidateQueries({ queryKey: ['orders'] })}
      />
    </div>
  );
}

/**
 * Issuing the bill and taking payment for one order.
 *
 * Opening the modal issues the invoice (a no-op if one already exists - the
 * backend returns the same invoice on a repeat call), then lets the cashier
 * take one or more payments against it until it is settled in full.
 */
function BillModal({
  order,
  onClose,
  onSettled,
}: {
  order: Order | null;
  onClose: () => void;
  onSettled: () => void;
}) {
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [amount, setAmount] = useState('');
  const [tenderedAmount, setTenderedAmount] = useState('');
  const [reference, setReference] = useState('');

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', order?.id],
    queryFn: () => apiPost<Invoice>(endpoints.billing.issueInvoice(order!.id)),
    enabled: Boolean(order),
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ['payment-methods', 'active'],
    queryFn: () => apiGet<PaymentMethodConfig[]>(endpoints.paymentMethods.list, { perPage: 50 }),
    enabled: Boolean(order),
  });

  const queryClient = useQueryClient();
  const activeMethods = paymentMethods?.filter((method) => method.isActive) ?? [];
  const selectedMethod = activeMethods.find((method) => String(method.id) === paymentMethodId);

  // Default the amount field to whatever is still owed each time the
  // outstanding balance changes (fresh invoice, or after a partial payment).
  useEffect(() => {
    if (invoice) setAmount(invoice.totals.outstanding.toFixed(2));
  }, [invoice?.totals.outstanding]);

  useEffect(() => {
    if (activeMethods.length > 0 && !paymentMethodId) setPaymentMethodId(String(activeMethods[0].id));
  }, [paymentMethods]);

  const capturePayment = useMutation({
    mutationFn: () =>
      apiPost<Invoice>(endpoints.billing.capturePayment(invoice!.id), {
        paymentMethodId: Number(paymentMethodId),
        amount: Number(amount),
        tenderedAmount: tenderedAmount ? Number(tenderedAmount) : undefined,
        reference: reference.trim() || undefined,
      }),
    onSuccess: (updated) => {
      if (updated.status === 'paid') {
        toast.success(`Bill ${updated.invoiceNumber} settled in full.`);
        onSettled();
        handleClose();
      } else {
        toast.success('Payment recorded.');
        queryClient.setQueryData(['invoice', order?.id], updated);
        setTenderedAmount('');
        setReference('');
      }
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not record that payment.'),
  });

  function handleClose() {
    setPaymentMethodId('');
    setAmount('');
    setTenderedAmount('');
    setReference('');
    onClose();
  }

  return (
    <Modal
      open={Boolean(order)}
      onClose={handleClose}
      title={order ? `Bill · ${order.orderNumber}` : 'Bill'}
      description={invoice ? `Invoice ${invoice.invoiceNumber}` : undefined}
      footer={
        invoice &&
        invoice.status !== 'paid' && (
          <Button
            isLoading={capturePayment.isPending}
            disabled={!paymentMethodId || !amount || Number(amount) <= 0}
            onClick={() => capturePayment.mutate()}
          >
            Take payment
          </Button>
        )
      }
    >
      {isLoading || !invoice ? (
        <p className="py-6 text-center text-sm text-ink-faint">Issuing the bill…</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5 rounded-control bg-raised p-3.5 text-sm">
            <div className="flex justify-between text-ink-soft">
              <span>Subtotal</span>
              <span className="numeric">{formatMoney(invoice.totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-ink-soft">
              <span>Tax + service</span>
              <span className="numeric">
                {formatMoney(invoice.totals.taxAmount + invoice.totals.serviceCharge)}
              </span>
            </div>
            <div className="flex justify-between border-t border-line pt-1.5 font-semibold text-ink">
              <span>Grand total</span>
              <span className="numeric">{formatMoney(invoice.totals.grandTotal)}</span>
            </div>
            <div className="flex justify-between text-ink-soft">
              <span>Paid</span>
              <span className="numeric">{formatMoney(invoice.totals.paidAmount)}</span>
            </div>
            <div className="flex justify-between font-semibold text-ember">
              <span>Outstanding</span>
              <span className="numeric">{formatMoney(invoice.totals.outstanding)}</span>
            </div>
          </div>

          {invoice.status === 'paid' ? (
            <p className="text-sm text-ink-soft">This bill is settled in full.</p>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="field-label">Payment method</label>
                <select
                  className="field"
                  value={paymentMethodId}
                  onChange={(event) => setPaymentMethodId(event.target.value)}
                >
                  {activeMethods.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.name}
                    </option>
                  ))}
                </select>
              </div>

              <TextField
                label="Amount received"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />

              {selectedMethod?.kind === 'cash' && (
                <TextField
                  label="Tendered (optional, for change)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tenderedAmount}
                  onChange={(event) => setTenderedAmount(event.target.value)}
                />
              )}

              {selectedMethod?.requiresReference && (
                <TextField
                  label="Transaction reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              )}
            </div>
          )}

          {invoice.payments.length > 0 && (
            <div className="space-y-1.5 border-t border-line pt-3">
              <p className="eyebrow">Payments so far</p>
              {invoice.payments.map((payment) => (
                <div key={payment.id} className="flex justify-between text-xs text-ink-soft">
                  <span>{payment.method.name}</span>
                  <span className="numeric">{formatMoney(payment.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

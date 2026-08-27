import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Banknote, Printer, Receipt as ReceiptIcon, Undo2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { apiGet, apiPost, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { useAuth } from '@/context/AuthContext';
import { OrderStatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { TextField } from '@/components/ui/TextField';
import { formatDate, formatMoney, formatRelative, formatTime, humanise } from '@/utils/format';
import type { Invoice, Order, OrderStatus, PaymentMethodConfig, Receipt } from '@/types/api';

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
  const { can } = useAuth();
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [billingOrder, setBillingOrder] = useState<Order | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [transitionTarget, setTransitionTarget] = useState<{
    order: Order;
    status: 'cancelled' | 'voided';
  } | null>(null);
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

  // One key per order, held until that order settles - a retry (a double tap,
  // a slow response) replays under the same key instead of minting a new one
  // that would defeat the server's replay guard and risk a second charge.
  const payOrderKeys = useRef(new Map<number, string>());

  function keyForOrderPayment(orderId: number): string {
    let key = payOrderKeys.current.get(orderId);
    if (!key) {
      key = crypto.randomUUID();
      payOrderKeys.current.set(orderId, key);
    }
    return key;
  }

  // One tap, full amount, cash by default - the fast lane next to the
  // itemised Bill modal for a counter that mostly takes cash.
  const payOrder = useMutation({
    mutationFn: (orderId: number) =>
      apiPost<Invoice>(endpoints.billing.pay(orderId), {
        idempotencyKey: keyForOrderPayment(orderId),
      }),
    onSuccess: (invoice, orderId) => {
      toast.success(`Bill ${invoice.invoiceNumber} settled in full.`);
      payOrderKeys.current.delete(orderId);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not settle that order.');
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

                <div className="flex flex-wrap items-center justify-end gap-2">
                  {BILLABLE_STATUSES.includes(order.status) && order.paymentStatus !== 'paid' && (
                    <>
                      {can('billing.issue') && (
                        <Button size="sm" variant="secondary" onClick={() => setBillingOrder(order)}>
                          <ReceiptIcon className="h-3.5 w-3.5" /> Bill
                        </Button>
                      )}
                      {can('billing.collect') && (
                        <Button
                          size="sm"
                          variant="secondary"
                          leadingIcon={<Banknote className="h-3.5 w-3.5" />}
                          isLoading={payOrder.isPending && payOrder.variables === order.id}
                          onClick={() => payOrder.mutate(order.id)}
                        >
                          Pay cash
                        </Button>
                      )}
                    </>
                  )}

                  {can('billing.view') &&
                    (BILLABLE_STATUSES.includes(order.status) || order.paymentStatus !== 'unpaid') && (
                      <Button size="sm" variant="ghost" onClick={() => setReceiptOrder(order)}>
                        <Printer className="h-3.5 w-3.5" /> Receipt
                      </Button>
                    )}

                  {can('billing.refund') && order.paymentStatus !== 'unpaid' && (
                    <Button size="sm" variant="ghost" onClick={() => setRefundOrder(order)}>
                      <Undo2 className="h-3.5 w-3.5" /> Refund
                    </Button>
                  )}

                  {order.allowedNextStatuses.map((status) => {
                    // Cancelling and voiding are separately gated and always
                    // need a reason, so they open a prompt rather than firing
                    // straight away like the forward move does.
                    if (status === 'cancelled') {
                      return can('orders.cancel') ? (
                        <Button
                          key={status}
                          size="sm"
                          variant="ghost"
                          onClick={() => setTransitionTarget({ order, status })}
                        >
                          <XCircle className="h-3.5 w-3.5" /> Cancel
                        </Button>
                      ) : null;
                    }

                    if (status === 'voided') {
                      return can('orders.void') ? (
                        <Button
                          key={status}
                          size="sm"
                          variant="danger"
                          onClick={() => setTransitionTarget({ order, status })}
                        >
                          <Ban className="h-3.5 w-3.5" /> Void
                        </Button>
                      ) : null;
                    }

                    return can('orders.updateStatus') ? (
                      <Button
                        key={status}
                        size="sm"
                        variant={order.status === 'pending' ? 'primary' : 'secondary'}
                        isLoading={
                          transition.isPending &&
                          transition.variables?.orderId === order.id &&
                          transition.variables?.status === status
                        }
                        onClick={() => transition.mutate({ orderId: order.id, status })}
                      >
                        {humanise(status)}
                      </Button>
                    ) : null;
                  })}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<ReceiptIcon className="h-6 w-6" />}
          title="Nothing on the board"
          description="New orders from the counter, a QR table or the website will show up here automatically."
        />
      )}

      <BillModal
        order={billingOrder}
        onClose={() => setBillingOrder(null)}
        onSettled={() => queryClient.invalidateQueries({ queryKey: ['orders'] })}
      />

      <ReceiptModal order={receiptOrder} onClose={() => setReceiptOrder(null)} />

      <RefundModal
        order={refundOrder}
        onClose={() => setRefundOrder(null)}
        onRefunded={() => queryClient.invalidateQueries({ queryKey: ['orders'] })}
      />

      <TransitionReasonModal
        target={transitionTarget}
        onClose={() => setTransitionTarget(null)}
        onDone={() => queryClient.invalidateQueries({ queryKey: ['orders'] })}
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

  // One key per tender: a split bill is several distinct payments and each
  // needs its own key, but a retry of the *same* tender (double tap, a slow
  // response) must replay under the same key rather than risk a second charge.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

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
        idempotencyKey: idempotencyKeyRef.current,
      }),
    onSuccess: (updated) => {
      // This tender is captured. The next one (another split, or a retry the
      // cashier means as a genuinely new attempt) gets a key of its own.
      idempotencyKeyRef.current = crypto.randomUUID();

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
    idempotencyKeyRef.current = crypto.randomUUID();
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

/**
 * The printable slip for one order. Reads GET /orders/:id/receipt, which
 * returns the order's own frozen snapshots - what it shows never changes on
 * a reprint, even if the menu or the table label has since changed.
 */
function ReceiptModal({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const { data: receipt, isLoading } = useQuery({
    queryKey: ['receipt', order?.id],
    queryFn: () => apiGet<Receipt>(endpoints.billing.receipt(order!.id)),
    enabled: Boolean(order),
  });

  return (
    <Modal
      open={Boolean(order)}
      onClose={onClose}
      title={order ? `Receipt · ${order.orderNumber}` : 'Receipt'}
      size="md"
      footer={
        receipt && (
          <Button leadingIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
            Print
          </Button>
        )
      }
    >
      {isLoading || !receipt ? (
        <p className="py-6 text-center text-sm text-ink-faint">Loading the receipt…</p>
      ) : (
        <div id="receipt-print-area" className="numeric space-y-3 text-sm">
          <div className="space-y-0.5 text-center">
            <p className="font-display text-base font-semibold text-ink">{receipt.restaurant.name}</p>
            {receipt.restaurant.address && (
              <p className="text-xs text-ink-soft">{receipt.restaurant.address}</p>
            )}
            <p className="text-xs text-ink-soft">{receipt.restaurant.phone}</p>
            <p className="text-xs text-ink-faint">{receipt.branchName}</p>
          </div>

          <div className="flex items-center justify-between border-y border-dashed border-line py-1.5">
            <span
              className={clsx(
                'rounded-pill px-2.5 py-0.5 text-xs font-bold tracking-wide',
                receipt.status === 'PAID' && 'bg-mint-soft text-mint',
                receipt.status === 'UNPAID' && 'bg-ember-soft text-ember',
                receipt.status === 'VOID' && 'bg-chili-soft text-chili',
              )}
            >
              {receipt.status}
            </span>
            <span className="text-xs text-ink-soft">
              {receipt.tokenNumber ? `Token #${receipt.tokenNumber}` : null}
              {receipt.tokenNumber && receipt.tableNumber ? ' · ' : null}
              {receipt.tableNumber ? `Table ${receipt.tableNumber}` : null}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-soft">
            <span>Order #{receipt.orderId}</span>
            <span className="text-right">{formatDate(receipt.date)} {formatTime(receipt.date)}</span>
            <span>{receipt.invoiceNumber ?? 'No bill yet'}</span>
            <span className="text-right">{humanise(receipt.orderType)}</span>
          </div>

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-line text-ink-faint">
                <th className="py-1 text-left font-medium">Item</th>
                <th className="py-1 text-right font-medium">Qty</th>
                <th className="py-1 text-right font-medium">Rate</th>
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item, index) => (
                <tr key={index} className="border-b border-line/60">
                  <td className="py-1 pr-2 text-ink">{item.name}</td>
                  <td className="py-1 text-right text-ink-soft">{item.quantity}</td>
                  <td className="py-1 text-right text-ink-soft">{formatMoney(item.rate)}</td>
                  <td className="py-1 text-right text-ink">{formatMoney(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1 border-t border-line pt-2">
            <div className="flex justify-between text-ink-soft">
              <span>Sub Total</span>
              <span>{formatMoney(receipt.subtotal)}</span>
            </div>
            <div className="flex justify-between text-ink-soft">
              <span>Service Charges ({receipt.serviceChargePercent}%)</span>
              <span>{formatMoney(receipt.serviceCharge)}</span>
            </div>
            {receipt.taxAmount > 0 && (
              <div className="flex justify-between text-ink-soft">
                <span>Tax</span>
                <span>{formatMoney(receipt.taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-1.5 text-base font-bold text-ink">
              <span>GRAND TOTAL</span>
              <span>{formatMoney(receipt.grandTotal)}</span>
            </div>
          </div>

          <div className="space-y-0.5 border-t border-dashed border-line pt-2 text-xs text-ink-soft">
            <div className="flex justify-between">
              <span>{humanise(receipt.orderType)}{receipt.covers ? ` · ${receipt.covers} covers` : ''}</span>
            </div>
            <div className="flex justify-between">
              <span>Order taker: {receipt.orderTaker ?? '—'}</span>
              <span>Printed {formatTime(receipt.printedAt)}</span>
            </div>
          </div>

          <div className="space-y-0.5 border-t border-dashed border-line pt-2 text-center text-xs text-ink-faint">
            <p>Complaints: {receipt.complaintsContact}</p>
            <p>{receipt.footer}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}

const REFUND_REASONS: Array<{ value: string; label: string }> = [
  { value: 'customer_complaint', label: 'Customer complaint' },
  { value: 'wrong_order', label: 'Wrong order' },
  { value: 'quality_issue', label: 'Quality issue' },
  { value: 'overcharge', label: 'Overcharge' },
  { value: 'duplicate_payment', label: 'Duplicate payment' },
  { value: 'other', label: 'Other' },
];

/**
 * Returning money against a bill. The original payment is left exactly as it
 * was - this writes a separate, compensating Refund row. Opening the modal
 * re-issues the invoice the same way the Bill modal does (a no-op if one
 * already exists), so the refundable balance is always read from the bill
 * itself, not from whatever this screen happened to have cached.
 */
function RefundModal({
  order,
  onClose,
  onRefunded,
}: {
  order: Order | null;
  onClose: () => void;
  onRefunded: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [reasonCode, setReasonCode] = useState(REFUND_REASONS[0].value);
  const [reasonNote, setReasonNote] = useState('');
  const [restockedInventory, setRestockedInventory] = useState(false);
  const queryClient = useQueryClient();

  // One key per refund attempt: a retry (a slow response, a double tap on
  // "Issue refund") must replay under the same key, not a fresh one that
  // would let the same money go back twice.
  const idempotencyKeyRef = useRef(crypto.randomUUID());

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', order?.id],
    queryFn: () => apiPost<Invoice>(endpoints.billing.issueInvoice(order!.id)),
    enabled: Boolean(order),
  });

  const refundable = invoice ? invoice.totals.paidAmount - invoice.totals.refundedAmount : 0;

  // Default the amount to the full refundable balance each time it changes
  // (a fresh invoice, or after an earlier partial refund).
  useEffect(() => {
    if (invoice) setAmount(Math.max(refundable, 0).toFixed(2));
  }, [invoice?.totals.paidAmount, invoice?.totals.refundedAmount]);

  const issueRefund = useMutation({
    mutationFn: () =>
      apiPost<Invoice>(endpoints.billing.refund(invoice!.id), {
        amount: Number(amount),
        reasonCode,
        reasonNote: reasonNote.trim() || undefined,
        restockedInventory,
        idempotencyKey: idempotencyKeyRef.current,
      }),
    onSuccess: (updated) => {
      toast.success(`Refund recorded on ${updated.invoiceNumber}.`);
      // This refund is issued. The next one (another partial, or a retry the
      // manager means as a genuinely new attempt) gets a key of its own.
      idempotencyKeyRef.current = crypto.randomUUID();
      // The Bill modal reads the same ['invoice', orderId] cache entry - keep
      // it current so reopening either modal shows this refund, not the
      // balance from before it.
      queryClient.setQueryData(['invoice', order?.id], updated);
      onRefunded();
      handleClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not issue that refund.'),
  });

  function handleClose() {
    setAmount('');
    setReasonCode(REFUND_REASONS[0].value);
    setReasonNote('');
    setRestockedInventory(false);
    idempotencyKeyRef.current = crypto.randomUUID();
    onClose();
  }

  return (
    <Modal
      open={Boolean(order)}
      onClose={handleClose}
      title={order ? `Refund · ${order.orderNumber}` : 'Refund'}
      description={invoice ? `Invoice ${invoice.invoiceNumber}` : undefined}
      footer={
        invoice &&
        refundable > 0 && (
          <Button
            variant="danger"
            isLoading={issueRefund.isPending}
            disabled={!amount || Number(amount) <= 0 || Number(amount) > refundable}
            onClick={() => issueRefund.mutate()}
          >
            Issue refund
          </Button>
        )
      }
    >
      {isLoading || !invoice ? (
        <p className="py-6 text-center text-sm text-ink-faint">Loading the bill…</p>
      ) : refundable <= 0 ? (
        <p className="py-6 text-center text-sm text-ink-soft">
          Nothing left to refund on this bill.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5 rounded-control bg-raised p-3.5 text-sm">
            <div className="flex justify-between text-ink-soft">
              <span>Paid</span>
              <span className="numeric">{formatMoney(invoice.totals.paidAmount)}</span>
            </div>
            <div className="flex justify-between text-ink-soft">
              <span>Already refunded</span>
              <span className="numeric">{formatMoney(invoice.totals.refundedAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-1.5 font-semibold text-ember">
              <span>Refundable</span>
              <span className="numeric">{formatMoney(refundable)}</span>
            </div>
          </div>

          <TextField
            label="Refund amount"
            type="number"
            min="0"
            max={refundable}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />

          <div>
            <label className="field-label">Reason</label>
            <select
              className="field"
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value)}
            >
              {REFUND_REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          </div>

          <TextField
            label="Note (optional)"
            value={reasonNote}
            onChange={(event) => setReasonNote(event.target.value)}
          />

          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={restockedInventory}
              onChange={(event) => setRestockedInventory(event.target.checked)}
            />
            Ingredients were put back in stock
          </label>

          {invoice.refunds.length > 0 && (
            <div className="space-y-1.5 border-t border-line pt-3">
              <p className="eyebrow">Refunds so far</p>
              {invoice.refunds.map((refund) => (
                <div key={refund.id} className="flex justify-between text-xs text-ink-soft">
                  <span>
                    {REFUND_REASONS.find((reason) => reason.value === refund.reasonCode)?.label ??
                      refund.reasonCode}
                  </span>
                  <span className="numeric">{formatMoney(refund.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/**
 * The reason prompt behind Cancel and Void. Both need one server-side - this
 * is what stops the request before it is sent rather than letting the API
 * reject it and leaving the cashier to guess why.
 */
function TransitionReasonModal({
  target,
  onClose,
  onDone,
}: {
  target: { order: Order; status: 'cancelled' | 'voided' } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');

  const transition = useMutation({
    mutationFn: () =>
      apiPost(endpoints.orders.transition(target!.order.id), {
        status: target!.status,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast.success(target!.status === 'voided' ? 'Order voided.' : 'Order cancelled.');
      onDone();
      handleClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not update that order.'),
  });

  function handleClose() {
    setReason('');
    onClose();
  }

  const isVoid = target?.status === 'voided';

  return (
    <Modal
      open={Boolean(target)}
      onClose={handleClose}
      title={target ? `${isVoid ? 'Void' : 'Cancel'} · ${target.order.orderNumber}` : ''}
      footer={
        <Button
          variant="danger"
          isLoading={transition.isPending}
          disabled={!reason.trim()}
          onClick={() => transition.mutate()}
        >
          {isVoid ? 'Void order' : 'Cancel order'}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-soft">
          {isVoid
            ? 'Voiding reverses an order after it has already gone through. This cannot be undone.'
            : 'Cancelling stops this order before it is billed.'}
        </p>
        <TextField
          label="Reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={isVoid ? 'Why is this being voided?' : 'Why is this being cancelled?'}
        />
      </div>
    </Modal>
  );
}

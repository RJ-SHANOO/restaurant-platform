import type { OrderStatus } from '@/types/api';

/**
 * The visual vocabulary of order state.
 *
 * Colour is meaning here, not decoration: ember means a human still has to act,
 * mint means done and paid, chilli means the money went backwards. Keeping the
 * mapping in one file is what stops "pending" being amber on one screen and
 * grey on another.
 */
type Tone = 'ember' | 'mint' | 'chili' | 'sky' | 'muted';

interface StatusMeta {
  label: string;
  tone: Tone;
  /** What the person looking at this screen is expected to do next. */
  hint: string;
}

export const ORDER_STATUS_META: Record<OrderStatus, StatusMeta> = {
  pending:   { label: 'Awaiting confirmation', tone: 'ember', hint: 'Accept or reject at the counter' },
  confirmed: { label: 'Confirmed',             tone: 'sky',   hint: 'Sent to the kitchen' },
  preparing: { label: 'Preparing',             tone: 'sky',   hint: 'On the pass' },
  ready:     { label: 'Ready',                 tone: 'mint',  hint: 'Take it to the table' },
  served:    { label: 'Served',                tone: 'mint',  hint: 'Ready to bill' },
  completed: { label: 'Completed',             tone: 'muted', hint: 'Paid and closed' },
  cancelled: { label: 'Cancelled',             tone: 'chili', hint: 'Cancelled before service' },
  voided:    { label: 'Voided',                tone: 'chili', hint: 'Reversed after billing' },
};

export const PILL_CLASS: Record<Tone, string> = {
  ember: 'pill pill-ember',
  mint:  'pill pill-mint',
  chili: 'pill pill-chili',
  sky:   'pill pill-sky',
  muted: 'pill pill-muted',
};

export function orderStatusPillClass(status: OrderStatus): string {
  return PILL_CLASS[ORDER_STATUS_META[status].tone];
}

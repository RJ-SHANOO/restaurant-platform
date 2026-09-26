import {
  ORDER_STATUS_META,
  orderStatusPillClass,
  PENDING_SYNC_META,
  PENDING_SYNC_PILL_CLASS,
} from '@/utils/statusMeta';
import type { OrderStatus } from '@/types/api';

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS_META[status];

  return (
    <span className={orderStatusPillClass(status)} title={meta.hint}>
      <span className="status-dot" />
      {meta.label}
    </span>
  );
}

/** For an order that failed to reach the server because of a dropped connection. */
export function PendingSyncPill() {
  return (
    <span className={PENDING_SYNC_PILL_CLASS} title={PENDING_SYNC_META.hint}>
      <span className="status-dot" />
      {PENDING_SYNC_META.label}
    </span>
  );
}

import { ORDER_STATUS_META, orderStatusPillClass } from '@/utils/statusMeta';
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

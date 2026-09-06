import { Truck } from 'lucide-react';
import { TextField } from '@/components/ui/TextField';
import type { MezbaanTabProps } from './types';

export function OnlineOrderingTab({ value, set }: MezbaanTabProps) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <Truck className="h-4 w-4 text-ember" />
        <h2 className="text-base font-semibold text-ink">Online ordering</h2>
      </div>

      <div className="space-y-4">
        <label className="flex cursor-pointer items-center justify-between rounded-control bg-raised p-3.5">
          <span className="text-sm text-ink">Accept online orders</span>
          <input
            type="checkbox"
            checked={value.acceptOnlineOrders}
            onChange={(event) => set('acceptOnlineOrders', event.target.checked)}
            className="h-4 w-4 accent-[rgb(245_165_36)]"
          />
        </label>

        {value.acceptOnlineOrders && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center justify-between rounded-control bg-raised p-3.5">
                <span className="text-sm text-ink">Delivery</span>
                <input
                  type="checkbox"
                  checked={value.deliveryEnabled}
                  onChange={(event) => set('deliveryEnabled', event.target.checked)}
                  className="h-4 w-4 accent-[rgb(245_165_36)]"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-control bg-raised p-3.5">
                <span className="text-sm text-ink">Pickup</span>
                <input
                  type="checkbox"
                  checked={value.pickupEnabled}
                  onChange={(event) => set('pickupEnabled', event.target.checked)}
                  className="h-4 w-4 accent-[rgb(245_165_36)]"
                />
              </label>
            </div>

            {value.deliveryEnabled && (
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  label="Delivery fee"
                  type="number"
                  value={String(value.deliveryFee)}
                  onChange={(event) => set('deliveryFee', Number(event.target.value) || 0)}
                />
                <TextField
                  label="Minimum order"
                  type="number"
                  value={String(value.minimumOrder)}
                  onChange={(event) => set('minimumOrder', Number(event.target.value) || 0)}
                />
                <TextField
                  label="Delivery radius (km)"
                  type="number"
                  value={String(value.deliveryRadiusKm)}
                  onChange={(event) => set('deliveryRadiusKm', Number(event.target.value) || 0)}
                />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

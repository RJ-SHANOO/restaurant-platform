import { Percent } from 'lucide-react';
import { TextField } from '@/components/ui/TextField';
import { PaymentMethodsManager } from './PaymentMethodsManager';
import type { MezbaanTabProps } from './types';

export function TaxChargesTab({ value, set, branchId }: MezbaanTabProps & { branchId: number }) {
  return (
    <div className="space-y-4">
      <section className="panel p-5">
        <PaymentMethodsManager branchId={branchId} compact />
      </section>

      <section className="panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <Percent className="h-4 w-4 text-ember" />
          <h2 className="text-base font-semibold text-ink">Tax</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="field-label">Tax mode</label>
            <select
              className="field mt-1.5"
              value={value.taxMode}
              onChange={(event) => set('taxMode', event.target.value as typeof value.taxMode)}
            >
              <option value="disabled">Disabled - no tax</option>
              <option value="uniform">Uniform - one rate on every bill</option>
              <option value="per_method">Per payment method - rate depends on how the customer pays</option>
              <option value="fixed">Fixed amount - a flat charge on every bill</option>
            </select>
          </div>

          {value.taxMode === 'uniform' && (
            <TextField
              label="Tax rate %"
              type="number"
              value={String(value.uniformRate)}
              onChange={(event) => set('uniformRate', Number(event.target.value) || 0)}
            />
          )}

          {value.taxMode === 'per_method' && (
            <p className="text-xs text-ink-faint">
              Set each payment method's own rate above, under "Tax rate %". A method left at 0% is not taxed.
            </p>
          )}

          {value.taxMode === 'fixed' && (
            <TextField
              label="Fixed tax amount"
              type="number"
              value={String(value.fixedAmount)}
              onChange={(event) => set('fixedAmount', Number(event.target.value) || 0)}
              hint="Added to every bill regardless of its size."
            />
          )}
        </div>
      </section>

      <section className="panel p-5">
        <label className="flex cursor-pointer items-center justify-between">
          <span className="text-sm font-semibold text-ink">Service charge</span>
          <input
            type="checkbox"
            checked={value.serviceChargeEnabled}
            onChange={(event) => set('serviceChargeEnabled', event.target.checked)}
            className="h-4 w-4 accent-[rgb(245_165_36)]"
          />
        </label>

        {value.serviceChargeEnabled && (
          <div className="mt-4">
            <TextField
              label="Service charge rate %"
              type="number"
              value={String(value.serviceChargeRate)}
              onChange={(event) => set('serviceChargeRate', Number(event.target.value) || 0)}
              hint="Applied to the bill before tax."
            />
          </div>
        )}
      </section>
    </div>
  );
}

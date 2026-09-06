import { Building2 } from 'lucide-react';
import { TextField } from '@/components/ui/TextField';
import type { MezbaanTabProps } from './types';

export function BusinessTab({ value, set }: MezbaanTabProps) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-ember" />
        <h2 className="text-base font-semibold text-ink">Business</h2>
      </div>

      <div className="space-y-4">
        <TextField
          label="Business name"
          value={value.businessName}
          onChange={(event) => set('businessName', event.target.value)}
          hint="Shown on receipts and the printed bill for this branch."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Phone"
            value={value.phone ?? ''}
            onChange={(event) => set('phone', event.target.value || null)}
            placeholder="Optional"
          />
          <TextField
            label="NTN"
            value={value.ntn ?? ''}
            onChange={(event) => set('ntn', event.target.value || null)}
            placeholder="Optional"
          />
        </div>

        <TextField
          label="Address"
          value={value.address ?? ''}
          onChange={(event) => set('address', event.target.value || null)}
          placeholder="Optional"
        />

        <TextField
          label="Currency symbol"
          value={value.currencySymbol}
          onChange={(event) => set('currencySymbol', event.target.value)}
          hint="Printed before every amount, e.g. Rs 450."
        />
      </div>
    </section>
  );
}

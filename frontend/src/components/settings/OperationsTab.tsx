import { Clock } from 'lucide-react';
import { TextField } from '@/components/ui/TextField';
import type { MezbaanTabProps } from './types';

export function OperationsTab({ value, set }: MezbaanTabProps) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4 text-ember" />
        <h2 className="text-base font-semibold text-ink">Operations</h2>
      </div>

      <div className="space-y-5">
        <div>
          <label className="field-label">How a business day is counted</label>
          <select
            className="field mt-1.5"
            value={value.dateMode}
            onChange={(event) => set('dateMode', event.target.value as typeof value.dateMode)}
          >
            <option value="calendar">Calendar day - midnight to midnight</option>
            <option value="business">Business day - rolls over at a set hour</option>
          </select>
        </div>

        {value.dateMode === 'business' && (
          <TextField
            label="Business day starts at"
            type="time"
            value={value.openingTime ?? ''}
            onChange={(event) => set('openingTime', event.target.value || null)}
            hint="An order placed before this hour still counts as the previous business day."
          />
        )}

        <div>
          <label className="field-label">Report grouping</label>
          <select
            className="field mt-1.5"
            value={value.reportGrouping}
            onChange={(event) => set('reportGrouping', event.target.value as typeof value.reportGrouping)}
          >
            <option value="day">By day</option>
            <option value="shift">By shift</option>
          </select>
        </div>
      </div>
    </section>
  );
}

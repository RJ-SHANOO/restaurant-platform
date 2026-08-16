import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiGet, apiPut, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type { RestaurantSettings } from '@/types/api';

const SETTLEMENT_LABEL: Record<RestaurantSettings['commercialTerms']['settlementFrequency'], string> = {
  daily: 'Daily',
  every_2_days: 'Every 2 days',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export default function SettingsPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Partial<RestaurantSettings>>({});

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiGet<RestaurantSettings>(endpoints.settings.show),
  });

  // Seed the draft once, when settings first arrive. Re-seeding on every
  // render would fight the user's typing.
  useEffect(() => {
    if (settings && Object.keys(draft).length === 0) {
      setDraft(settings);
    }
  }, [settings, draft]);

  const save = useMutation({
    mutationFn: (payload: Partial<RestaurantSettings>) =>
      apiPut<RestaurantSettings>(endpoints.settings.update, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings updated.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save that.'),
  });

  if (isLoading || !settings) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const canEdit = can('settings.update');
  const value = { ...settings, ...draft };
  const set = <K extends keyof RestaurantSettings>(key: K, next: RestaurantSettings[K]) =>
    setDraft((current) => ({ ...current, [key]: next }));

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Restaurant</p>
        <h1 className="mt-1.5 text-display-md text-ink">Settings</h1>
        <p className="mt-2 text-sm text-ink-soft">Your restaurant's own profile, as customers and staff see it.</p>
      </header>

      <div className="panel max-w-2xl space-y-4 p-5">
        <TextField
          label="Restaurant name"
          value={value.name}
          disabled={!canEdit}
          onChange={(event) => set('name', event.target.value)}
        />

        {canEdit ? (
          <ImageUploadField label="Logo" value={value.logoPath ?? ''} onChange={(url) => set('logoPath', url)} />
        ) : value.logoPath ? (
          <img src={value.logoPath} alt="" className="h-12 w-12 rounded-control border border-line object-cover" />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Contact email"
            type="email"
            value={value.contactEmail}
            disabled={!canEdit}
            onChange={(event) => set('contactEmail', event.target.value)}
          />
          <TextField
            label="Contact phone"
            value={value.contactPhone}
            disabled={!canEdit}
            onChange={(event) => set('contactPhone', event.target.value)}
            maxLength={11}
            inputMode="numeric"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Address"
            value={value.addressLine ?? ''}
            disabled={!canEdit}
            onChange={(event) => set('addressLine', event.target.value)}
          />
          <TextField
            label="City"
            value={value.city ?? ''}
            disabled={!canEdit}
            onChange={(event) => set('city', event.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Currency code"
            value={value.currencyCode}
            disabled={!canEdit}
            maxLength={3}
            onChange={(event) => set('currencyCode', event.target.value.toUpperCase())}
          />
          <TextField
            label="Timezone"
            value={value.timezone}
            disabled={!canEdit}
            onChange={(event) => set('timezone', event.target.value)}
          />
        </div>

        {canEdit && (
          <div className="flex justify-end border-t border-line pt-4">
            <Button isLoading={save.isPending} onClick={() => save.mutate(draft)}>
              Save changes
            </Button>
          </div>
        )}
      </div>

      <div className="panel max-w-2xl space-y-3 p-5">
        <h2 className="text-sm font-semibold text-ink">Commercial terms</h2>
        <p className="text-xs text-ink-soft">
          Set by the platform when your account was approved. To change these, contact the platform.
        </p>

        <dl className="grid gap-3 border-t border-line pt-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-faint">Commission</dt>
            <dd className="numeric mt-0.5 text-ink">
              {settings.commercialTerms.commissionType === 'percentage'
                ? `${settings.commercialTerms.commissionValue}%`
                : `Rs ${settings.commercialTerms.commissionValue}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Settlement</dt>
            <dd className="mt-0.5 text-ink">{SETTLEMENT_LABEL[settings.commercialTerms.settlementFrequency]}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-faint">Status</dt>
            <dd className="mt-0.5 capitalize text-ink">{settings.status}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

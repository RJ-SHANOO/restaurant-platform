import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { apiGet } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Skeleton } from '@/components/ui/Skeleton';

interface PlatformTerms {
  commissionType: 'percentage' | 'fixed';
  commissionValue: number;
  settlementFrequency: 'daily' | 'every_2_days' | 'weekly' | 'monthly';
  currencyCode: string;
}

const SETTLEMENT_LABEL: Record<PlatformTerms['settlementFrequency'], string> = {
  daily: 'Daily',
  every_2_days: 'Every 2 days',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

/**
 * Read-only. These figures come from the server's own config
 * (PLATFORM_COMMISSION_TYPE etc. in backend/.env), not the database - on
 * purpose, so changing one never rewrites the terms an existing restaurant
 * already agreed to. To change the default, edit the environment and
 * redeploy; to change one restaurant's own rate, use its commercial terms.
 */
export default function PlatformSettingsPage() {
  const { data: terms, isLoading } = useQuery({
    queryKey: ['platform-terms'],
    queryFn: () => apiGet<PlatformTerms>(endpoints.auth.platformTerms),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <p className="eyebrow">Platform</p>
        <h1 className="mt-1.5 text-display-md text-ink">Settings</h1>
        <p className="mt-2 text-sm text-ink-soft">
          The terms every new restaurant registers on.
        </p>
      </header>

      {isLoading || !terms ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="panel p-6">
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-faint">Commission type</dt>
              <dd className="mt-1 text-lg font-semibold capitalize text-ink">
                {terms.commissionType}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-ink-faint">Default rate</dt>
              <dd className="numeric mt-1 text-lg font-semibold text-ember">
                {terms.commissionType === 'percentage'
                  ? `${terms.commissionValue}%`
                  : `${terms.currencyCode} ${terms.commissionValue}`}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-ink-faint">Settlement frequency</dt>
              <dd className="mt-1 text-lg font-semibold text-ink">
                {SETTLEMENT_LABEL[terms.settlementFrequency]}
              </dd>
            </div>

            <div>
              <dt className="text-xs text-ink-faint">Currency</dt>
              <dd className="mt-1 text-lg font-semibold text-ink">{terms.currencyCode}</dd>
            </div>
          </dl>

          <div className="mt-6 flex items-start gap-2.5 rounded-card border border-line-strong bg-raised p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
            <p className="text-xs text-ink-soft">
              Set from the server's environment config, not the database - changing it only
              affects restaurants that register after the change. Every restaurant that has
              already signed up keeps the rate it agreed to; adjust one of those from its own
              page under Restaurants instead. To create a restaurant on a rate other than this
              default, use{' '}
              <span className="font-medium text-ink">Restaurants → Add restaurant</span>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Building2, MapPin, Plus, QrCode, Truck } from 'lucide-react';
import { apiGet } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type { Branch } from '@/types/api';

export default function BranchListPage() {
  const { can } = useAuth();

  const { data: branches, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => apiGet<Branch[]>(endpoints.branches.list),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Operations</p>
          <h1 className="mt-1.5 text-display-md text-ink">Branches</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Each branch keeps its own tables, staff, stock and tax rates.
          </p>
        </div>

        {can('branches.create') && (
          <Button leadingIcon={<Plus className="h-4 w-4" />}>Add branch</Button>
        )}
      </header>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-44 w-full" />
          ))}
        </div>
      ) : branches && branches.length > 0 ? (
        <div className="grid gap-4 stagger-children md:grid-cols-2 xl:grid-cols-3">
          {branches.map((branch) => (
            <article key={branch.id} className="panel-interactive p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-base font-semibold text-ink">
                    {branch.name}
                  </h2>
                  <p className="numeric mt-0.5 text-xs text-ink-faint">{branch.code}</p>
                </div>

                <span className={branch.status === 'active' ? 'pill pill-mint' : 'pill pill-muted'}>
                  <span className="status-dot" />
                  {branch.status}
                </span>
              </div>

              {branch.addressLine && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-soft">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="line-clamp-2">{branch.addressLine}</span>
                </p>
              )}

              <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4">
                <div>
                  <dt className="eyebrow">Tables</dt>
                  <dd className="numeric mt-1 text-lg font-semibold text-ink">
                    {branch.counts?.diningTables ?? 0}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                {branch.capabilities.acceptsQrOrders && (
                  <span className="pill pill-sky">
                    <QrCode className="h-3 w-3" /> QR ordering
                  </span>
                )}
                {branch.capabilities.acceptsDelivery && (
                  <span className="pill pill-muted">
                    <Truck className="h-3 w-3" /> Delivery
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title="No branches yet"
          description="Add your first branch to start taking orders. You can add more outlets at any time."
          action={can('branches.create') && <Button leadingIcon={<Plus className="h-4 w-4" />}>Add branch</Button>}
        />
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Store } from 'lucide-react';
import { apiGet } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { TextField } from '@/components/ui/TextField';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate } from '@/utils/format';
import type { Restaurant } from '@/types/api';

const STATUS_PILL: Record<Restaurant['status'], string> = {
  active: 'pill pill-mint',
  pending: 'pill pill-ember',
  suspended: 'pill pill-chili',
  closed: 'pill pill-muted',
};

export default function RestaurantListPage() {
  const [search, setSearch] = useState('');

  const { data: restaurants, isLoading } = useQuery({
    queryKey: ['platform', 'restaurants', search],
    queryFn: () => apiGet<Restaurant[]>(endpoints.platform.restaurants, { search, perPage: 50 }),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Platform</p>
          <h1 className="mt-1.5 text-display-md text-ink">Restaurants</h1>
        </div>

        <div className="w-full max-w-xs">
          <TextField
            placeholder="Search by name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leadingIcon={<Search className="h-4 w-4" />}
          />
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : restaurants && restaurants.length > 0 ? (
        <div className="panel overflow-hidden">
          <div className="hidden grid-cols-12 gap-4 border-b border-line px-5 py-3 lg:grid">
            <span className="eyebrow col-span-4">Restaurant</span>
            <span className="eyebrow col-span-2">Status</span>
            <span className="eyebrow col-span-2">Branches</span>
            <span className="eyebrow col-span-2">Commission</span>
            <span className="eyebrow col-span-2">Joined</span>
          </div>

          <div className="divide-y divide-line stagger-children">
            {restaurants.map((restaurant) => (
              <div
                key={restaurant.id}
                className="grid grid-cols-2 gap-3 px-5 py-4 transition-colors hover:bg-raised lg:grid-cols-12 lg:gap-4"
              >
                <div className="col-span-2 lg:col-span-4">
                  <p className="font-medium text-ink">{restaurant.name}</p>
                  <p className="text-xs text-ink-faint">
                    {restaurant.city ?? 'No city set'} · {restaurant.contactEmail}
                  </p>
                </div>

                <div className="lg:col-span-2">
                  <span className={STATUS_PILL[restaurant.status]}>
                    <span className="status-dot" />
                    {restaurant.status}
                  </span>
                </div>

                <p className="numeric text-sm text-ink-soft lg:col-span-2">
                  {restaurant.counts?.branches ?? 0}
                </p>

                <p className="numeric text-sm text-ink-soft lg:col-span-2">
                  {restaurant.commercialTerms.commissionType === 'percentage'
                    ? `${restaurant.commercialTerms.commissionValue}%`
                    : `Rs ${restaurant.commercialTerms.commissionValue}`}
                </p>

                <p className="text-xs text-ink-faint lg:col-span-2">
                  {formatDate(restaurant.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Store className="h-6 w-6" />}
          title="No restaurants match that search"
          description="Try a shorter name, or clear the search to see everyone on the platform."
        />
      )}
    </div>
  );
}

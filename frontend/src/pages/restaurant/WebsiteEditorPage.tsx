import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { apiGet, apiPatch, apiPut, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import { ColoursTab } from '@/components/website/ColoursTab';
import { HeaderTab } from '@/components/website/HeaderTab';
import { HomeTab } from '@/components/website/HomeTab';
import { ShopTab } from '@/components/website/ShopTab';
import { FooterTab } from '@/components/website/FooterTab';
import { SitePreview } from '@/components/website/SitePreview';
import type { WebsiteSettings } from '@/components/website/types';

/**
 * Where a restaurant makes the platform look like its own.
 *
 * The preview on the right is rendered from the same values that will be
 * served publicly, so what the owner adjusts here is what a customer sees -
 * no separate preview theme that can drift out of step with the real one. It
 * stays mounted across every tab so a change made on Header is still visible
 * while editing Shop.
 */

const TABS = [
  { key: 'colours', label: 'Colors' },
  { key: 'header', label: 'Header' },
  { key: 'home', label: 'Home' },
  { key: 'shop', label: 'Shop' },
  { key: 'footer', label: 'Footer' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function WebsiteEditorPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Partial<WebsiteSettings>>({});
  const [activeTab, setActiveTab] = useState<TabKey>('colours');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['website'],
    queryFn: () => apiGet<WebsiteSettings>(endpoints.website.show),
  });

  // Seed the draft once, when the settings first arrive. Re-seeding on every
  // render would fight the user's typing.
  useEffect(() => {
    if (settings && Object.keys(draft).length === 0) {
      setDraft(settings);
    }
  }, [settings, draft]);

  const save = useMutation({
    mutationFn: (payload: Partial<WebsiteSettings>) =>
      apiPut<WebsiteSettings>(endpoints.website.update, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['website'] });
      toast.success('Website updated.');
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'Could not save that.'),
  });

  const togglePublished = useMutation({
    mutationFn: (isPublished: boolean) =>
      apiPatch(endpoints.website.setPublished, { isPublished }),
    onSuccess: (_data, isPublished) => {
      queryClient.invalidateQueries({ queryKey: ['website'] });
      toast.success(isPublished ? 'Your site is live.' : 'Your site is offline.');
    },
  });

  if (isLoading || !settings) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const value = { ...settings, ...draft };
  const set = <K extends keyof WebsiteSettings>(key: K, next: WebsiteSettings[K]) =>
    setDraft((current) => ({ ...current, [key]: next }));

  const publicUrl = `/site/${user?.scope.restaurantSlug ?? ''}`;

  const tabProps = { value, set };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your website</p>
          <h1 className="mt-1.5 text-display-md text-ink">Appearance</h1>
          <p className="mt-2 max-w-lg text-sm text-ink-soft">
            Your own page, in your own colours, listing your branches. Customers see this
            when they scan a table code or open your link.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className={clsx('pill', value.isPublished ? 'pill-mint' : 'pill-muted')}
          >
            <span className="status-dot" />
            {value.isPublished ? 'Live' : 'Offline'}
          </span>

          <Button
            variant={value.isPublished ? 'secondary' : 'primary'}
            isLoading={togglePublished.isPending}
            onClick={() => togglePublished.mutate(!value.isPublished)}
          >
            {value.isPublished ? 'Take offline' : 'Publish'}
          </Button>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-5">
        {/* ------------------------------------------------------- controls */}
        <div className="space-y-5 xl:col-span-3">
          <div className="flex flex-wrap gap-1.5 rounded-control border border-line bg-raised p-1.5">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'rounded-control px-3.5 py-2 text-sm font-medium transition-colors',
                  activeTab === tab.key
                    ? 'bg-ember-soft text-ember'
                    : 'text-ink-soft hover:text-ink',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'colours' && <ColoursTab {...tabProps} />}
          {activeTab === 'header' && <HeaderTab {...tabProps} />}
          {activeTab === 'home' && <HomeTab {...tabProps} />}
          {activeTab === 'shop' && <ShopTab {...tabProps} />}
          {activeTab === 'footer' && <FooterTab {...tabProps} />}

          <div className="flex items-center gap-3">
            <Button
              size="lg"
              isLoading={save.isPending}
              onClick={() => save.mutate(draft)}
            >
              Save changes
            </Button>

            {value.isPublished && (
              <a href={publicUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">
                <ExternalLink className="h-4 w-4" />
                View site
              </a>
            )}
          </div>
        </div>

        {/* -------------------------------------------------------- preview */}
        <div className="xl:col-span-2">
          <div className="sticky top-6">
            <p className="eyebrow mb-2.5">Preview</p>
            <SitePreview settings={value} restaurantName={user?.scope.restaurantName ?? 'Your Restaurant'} />
          </div>
        </div>
      </div>
    </div>
  );
}

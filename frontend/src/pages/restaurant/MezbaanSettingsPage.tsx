import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import clsx from 'clsx';
import { apiGet, apiPatch, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import { BusinessTab } from '@/components/settings/BusinessTab';
import { OperationsTab } from '@/components/settings/OperationsTab';
import { TaxChargesTab } from '@/components/settings/TaxChargesTab';
import { OnlineOrderingTab } from '@/components/settings/OnlineOrderingTab';
import type { Branch, BranchSettings } from '@/types/api';

/**
 * Mezbaan: one branch's own business profile, hours, tax mode and online
 * ordering. Owner or Branch Manager only (settings.view / settings.update).
 *
 * An owner sees every branch, so has to say which one; a Branch Manager is
 * bound to theirs and never sees the picker.
 */

const TABS = [
  { key: 'business', label: 'Business' },
  { key: 'operations', label: 'Operations' },
  { key: 'tax', label: 'Tax & Charges' },
  { key: 'online', label: 'Online Ordering' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function MezbaanSettingsPage() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const isBranchBound = user?.scope.branchId != null;

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => apiGet<Branch[]>(endpoints.branches.list),
    enabled: !isBranchBound,
  });

  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    user?.scope.branchId ? String(user.scope.branchId) : '',
  );

  const branchId = user?.scope.branchId ?? (Number(selectedBranchId) || branches?.[0]?.id);

  const [draft, setDraft] = useState<Partial<BranchSettings>>({});
  const [activeTab, setActiveTab] = useState<TabKey>('business');
  const canManage = can('settings.update');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['branch-settings', branchId],
    queryFn: () => apiGet<BranchSettings>(endpoints.branchSettings.show, { branchId }),
    enabled: !!branchId,
  });

  // Seed the draft once per branch, when its settings arrive. Switching
  // branches must reset the draft, not merge one branch's edits onto another.
  useEffect(() => {
    setDraft({});
  }, [branchId]);

  useEffect(() => {
    if (settings && Object.keys(draft).length === 0) {
      setDraft(settings);
    }
  }, [settings, draft]);

  const save = useMutation({
    mutationFn: (payload: Partial<BranchSettings>) =>
      apiPatch<BranchSettings>(endpoints.branchSettings.update, payload, { branchId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branch-settings', branchId] });
      toast.success('Settings updated.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save that.'),
  });

  if (!branchId || isLoading || !settings) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const value = { ...settings, ...draft } as BranchSettings;
  const set = <K extends keyof BranchSettings>(key: K, next: BranchSettings[K]) =>
    setDraft((current) => ({ ...current, [key]: next }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1 className="mt-1.5 text-display-md text-ink">Mezbaan</h1>
          <p className="mt-2 max-w-lg text-sm text-ink-soft">
            How this branch presents itself, when its business day rolls over, and how tax,
            service charge and online ordering work at checkout.
          </p>
        </div>

        {!isBranchBound && branches && branches.length > 1 && (
          <select
            className="field w-auto"
            value={String(branchId)}
            onChange={(event) => setSelectedBranchId(event.target.value)}
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        )}
      </header>

      <div className="space-y-5">
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

        {activeTab === 'business' && <BusinessTab value={value} set={set} />}
        {activeTab === 'operations' && <OperationsTab value={value} set={set} />}
        {activeTab === 'tax' && <TaxChargesTab value={value} set={set} branchId={branchId} />}
        {activeTab === 'online' && <OnlineOrderingTab value={value} set={set} />}

        {canManage && (
          <Button size="lg" isLoading={save.isPending} onClick={() => save.mutate(draft)}>
            Save changes
          </Button>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, MapPin, Plus, QrCode, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/context/AuthContext';
import type { Branch } from '@/types/api';

export default function BranchListPage() {
  const { can } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

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
          <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
            Add branch
          </Button>
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
          action={
            can('branches.create') && (
              <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setModalOpen(true)}>
                Add branch
              </Button>
            )
          }
        />
      )}

      {modalOpen && <AddBranchModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}

function AddBranchModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost(endpoints.branches.create, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      toast.success('Branch added.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save that.'),
  });

  const codeValid = /^[A-Z0-9-]{2,20}$/.test(code);
  const canSave = name.trim().length >= 2 && codeValid;

  return (
    <Modal
      open
      onClose={onClose}
      title="Add branch"
      description="Each branch gets its own tables, staff, stock and tax rates."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            isLoading={save.isPending}
            disabled={!canSave}
            onClick={() =>
              save.mutate({
                name,
                code,
                addressLine: addressLine || null,
                city: city || null,
                phone: phone || null,
              })
            }
          >
            Add branch
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Gulberg Branch"
        />
        <TextField
          label="Code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="GLB-01"
          hint="Capital letters, numbers and hyphens only."
        />
        <TextField label="Address" value={addressLine} onChange={(event) => setAddressLine(event.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="City" value={city} onChange={(event) => setCity(event.target.value)} />
          <TextField
            label="Phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={11}
            inputMode="numeric"
            placeholder="03001234567"
          />
        </div>
      </div>
    </Modal>
  );
}

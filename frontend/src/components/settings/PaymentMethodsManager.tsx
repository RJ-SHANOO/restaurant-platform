import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CreditCard, HandCoins, Landmark, Pencil, Plus, Smartphone, Trash2, Wallet as WalletIcon } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Modal } from '@/components/ui/Modal';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type { PaymentMethodConfig, PaymentMethodKind } from '@/types/api';

const KIND_ICON: Record<PaymentMethodKind, typeof Banknote> = {
  cash: Banknote,
  card: CreditCard,
  wallet: Smartphone,
  bank: Landmark,
  online: WalletIcon,
  credit: HandCoins,
};

const KIND_LABEL: Record<PaymentMethodKind, string> = {
  cash: 'Cash',
  card: 'Card',
  wallet: 'Mobile wallet',
  bank: 'Bank transfer',
  online: 'Online',
  credit: 'Credit / on account',
};

/**
 * How a branch accepts money at the counter. Shared between the standalone
 * Payments page and Mezbaan's Tax & Charges tab (which also needs each
 * method's taxRate visible, for per_method tax mode) - one CRUD surface, two
 * places it's shown.
 */
export function PaymentMethodsManager({ branchId, compact = false }: { branchId: number; compact?: boolean }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; editing?: PaymentMethodConfig }>({ open: false });
  const queryKey = ['payment-methods', branchId];

  const { data: methods, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiGet<PaymentMethodConfig[]>(endpoints.paymentMethods.list, { branchId }),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiPatch(endpoints.paymentMethods.detail(id), { isActive }, { branchId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not update that.'),
  });

  const deleteMethod = useMutation({
    mutationFn: (id: number) => apiDelete(endpoints.paymentMethods.detail(id), { branchId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Payment method removed.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not remove that.'),
  });

  const canManage = can('settings.update');

  return (
    <div className="space-y-4">
      {!compact && (
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Settings</p>
            <h1 className="mt-1.5 text-display-md text-ink">Payment methods</h1>
            <p className="mt-2 text-sm text-ink-soft">
              How customers pay at the counter. Turn one off instead of deleting it once it has been used -
              past payments still need to point to something.
            </p>
          </div>

          {canManage && (
            <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setModal({ open: true })}>
              Add method
            </Button>
          )}
        </header>
      )}

      {compact && canManage && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Payment methods</h3>
          <Button size="sm" variant="secondary" leadingIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setModal({ open: true })}>
            Add method
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className={clsx('grid gap-3', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>
          {Array.from({ length: compact ? 2 : 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full" />
          ))}
        </div>
      ) : methods && methods.length > 0 ? (
        <div className={clsx('grid gap-3 stagger-children', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>
          {methods.map((method) => {
            const Icon = KIND_ICON[method.kind];
            return (
              <article key={method.id} className="panel-interactive p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-raised text-ink-soft">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-ink">{method.name}</h3>
                      <p className="text-xs text-ink-faint">{KIND_LABEL[method.kind]}</p>
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => setModal({ open: true, editing: method })} className="rounded-control p-1.5 text-ink-faint hover:bg-raised hover:text-ink">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Remove "${method.name}"?`)) deleteMethod.mutate(method.id);
                        }}
                        className="rounded-control p-1.5 text-ink-faint hover:bg-chili-soft hover:text-chili"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {(method.accountTitle || method.accountNumber) && (
                  <p className="mt-2.5 truncate text-xs text-ink-faint">
                    {[method.accountTitle, method.accountNumber].filter(Boolean).join(' · ')}
                  </p>
                )}

                {method.qrImageUrl && (
                  <img
                    src={method.qrImageUrl}
                    alt={`${method.name} QR code`}
                    className="mt-2.5 h-20 w-20 rounded-control border border-line object-contain"
                  />
                )}

                {method.requiresReference && (
                  <p className="mt-2.5 text-xs text-ink-faint">Needs a reference number at time of payment.</p>
                )}

                {method.taxRate > 0 && (
                  <p className="mt-2.5 text-xs text-ink-faint">Taxed at {method.taxRate}% when per-method tax applies.</p>
                )}

                <label className="mt-4 flex cursor-pointer items-center justify-between border-t border-line pt-3">
                  <span className={clsx('pill', method.isActive ? 'pill-mint' : 'pill-muted')}>
                    <span className="status-dot" />
                    {method.isActive ? 'Active' : 'Off'}
                  </span>
                  {canManage && (
                    <input
                      type="checkbox"
                      checked={method.isActive}
                      onChange={(event) => toggleActive.mutate({ id: method.id, isActive: event.target.checked })}
                      className="h-4 w-4 accent-[rgb(245_165_36)]"
                    />
                  )}
                </label>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<WalletIcon className="h-6 w-6" />}
          title="No payment methods yet"
          description="Add cash and whatever else you accept - card, JazzCash, Easypaisa, bank transfer."
          action={
            canManage && (
              <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setModal({ open: true })}>
                Add method
              </Button>
            )
          }
        />
      )}

      {modal.open && (
        <MethodModal branchId={branchId} editing={modal.editing} onClose={() => setModal({ open: false })} />
      )}
    </div>
  );
}

function MethodModal({
  branchId,
  editing,
  onClose,
}: {
  branchId: number;
  editing?: PaymentMethodConfig;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [kind, setKind] = useState<PaymentMethodKind>(editing?.kind ?? 'cash');
  const [requiresReference, setRequiresReference] = useState(editing?.requiresReference ?? false);
  const [accountTitle, setAccountTitle] = useState(editing?.accountTitle ?? '');
  const [accountNumber, setAccountNumber] = useState(editing?.accountNumber ?? '');
  const [qrImageUrl, setQrImageUrl] = useState(editing?.qrImageUrl ?? '');
  const [instructions, setInstructions] = useState(editing?.instructions ?? '');
  const [taxRate, setTaxRate] = useState(String(editing?.taxRate ?? 0));

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing
        ? apiPut(endpoints.paymentMethods.detail(editing.id), payload, { branchId })
        : apiPost(endpoints.paymentMethods.create, payload, { branchId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods', branchId] });
      toast.success(editing ? 'Payment method updated.' : 'Payment method added.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save that.'),
  });

  const canSave = name.trim().length >= 2 && /^[a-z0-9_]+$/.test(code);

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit payment method' : 'Add payment method'}
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
                kind,
                requiresReference,
                accountTitle: accountTitle || null,
                accountNumber: accountNumber || null,
                qrImageUrl: qrImageUrl || null,
                instructions: instructions || null,
                taxRate: Number(taxRate) || 0,
              })
            }
          >
            {editing ? 'Save changes' : 'Add method'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} placeholder="JazzCash" />
          <TextField
            label="Code"
            value={code}
            onChange={(event) => setCode(event.target.value.toLowerCase())}
            placeholder="jazzcash"
            hint="Lowercase, no spaces."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">Type</label>
            <select className="field" value={kind} onChange={(event) => setKind(event.target.value as PaymentMethodKind)}>
              {Object.entries(KIND_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <TextField
            label="Tax rate %"
            type="number"
            value={taxRate}
            onChange={(event) => setTaxRate(event.target.value)}
            hint="Only used when the branch's tax mode is per-method."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Account title" value={accountTitle} onChange={(event) => setAccountTitle(event.target.value)} placeholder="Optional" />
          <TextField label="Account number" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} placeholder="Optional" />
        </div>

        <ImageUploadField label="QR code" value={qrImageUrl} onChange={setQrImageUrl} />

        <div>
          <label className="field-label">Instructions shown at the counter</label>
          <textarea rows={2} className="field resize-none" value={instructions} onChange={(event) => setInstructions(event.target.value)} />
        </div>

        <label className="flex cursor-pointer items-center justify-between rounded-control bg-raised p-3.5">
          <span className="text-sm text-ink">Requires a reference number</span>
          <input
            type="checkbox"
            checked={requiresReference}
            onChange={(event) => setRequiresReference(event.target.checked)}
            className="h-4 w-4 accent-[rgb(245_165_36)]"
          />
        </label>
      </div>
    </Modal>
  );
}

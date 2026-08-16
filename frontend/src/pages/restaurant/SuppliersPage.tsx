import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Pencil, Plus, Trash2, Truck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import clsx from 'clsx';
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type { Branch, InventoryItem, Purchase, PurchaseStatus, Supplier } from '@/types/api';

type Tab = 'suppliers' | 'purchases';

const STATUS_PILL: Record<PurchaseStatus, string> = {
  draft: 'pill-sky',
  received: 'pill-mint',
  cancelled: 'pill-muted',
};

export default function SuppliersPage() {
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('purchases');

  const [supplierModal, setSupplierModal] = useState<{ open: boolean; editing?: Supplier }>({ open: false });
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);

  const { data: suppliers, isLoading: suppliersLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiGet<Supplier[]>(endpoints.suppliers.list),
  });

  const { data: purchases, isLoading: purchasesLoading } = useQuery({
    queryKey: ['purchases'],
    queryFn: () => apiGet<Purchase[]>(endpoints.purchases.list),
  });

  const deleteSupplier = useMutation({
    mutationFn: (id: number) => apiDelete(endpoints.suppliers.detail(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Supplier removed.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not remove that.'),
  });

  const receivePurchase = useMutation({
    mutationFn: (id: number) => apiPost(endpoints.purchases.receive(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Purchase received. Stock updated.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not receive that.'),
  });

  const cancelPurchase = useMutation({
    mutationFn: (id: number) => apiPost(endpoints.purchases.cancel(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      toast.success('Purchase cancelled.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not cancel that.'),
  });

  const canManage = can('inventory.purchase');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Stock in</p>
          <h1 className="mt-1.5 text-display-md text-ink">Suppliers &amp; purchases</h1>
          <p className="mt-2 text-sm text-ink-soft">
            A purchase is a plan until it is received - stock only moves when you mark it received.
          </p>
        </div>

        <div className="flex gap-2 rounded-control border border-line bg-raised p-1">
          <TabButton active={tab === 'purchases'} onClick={() => setTab('purchases')} icon={ClipboardList}>Purchases</TabButton>
          <TabButton active={tab === 'suppliers'} onClick={() => setTab('suppliers')} icon={Truck}>Suppliers</TabButton>
        </div>
      </header>

      {tab === 'purchases' ? (
        <div className="space-y-4">
          {canManage && (
            <div className="flex justify-end">
              <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setPurchaseModalOpen(true)}>
                New purchase
              </Button>
            </div>
          )}

          {purchasesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
              ))}
            </div>
          ) : purchases && purchases.length > 0 ? (
            <div className="space-y-3">
              {purchases.map((purchase) => (
                <article key={purchase.id} className="panel p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="numeric text-sm font-semibold text-ink">{purchase.purchaseNumber}</p>
                        <span className={clsx('pill', STATUS_PILL[purchase.status])}>
                          <span className="status-dot" />
                          {purchase.status}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-faint">
                        {purchase.branch.name}
                        {purchase.supplier ? ` · ${purchase.supplier.name}` : ''} · {purchase.items.length} item(s)
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="numeric text-base font-semibold text-ink">
                        Rs {purchase.totalAmount.toLocaleString()}
                      </span>

                      {canManage && purchase.status === 'draft' && (
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            leadingIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                            isLoading={receivePurchase.isPending}
                            onClick={() => receivePurchase.mutate(purchase.id)}
                          >
                            Receive
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            leadingIcon={<XCircle className="h-3.5 w-3.5" />}
                            onClick={() => {
                              if (confirm('Cancel this purchase? It never happened, no stock is affected.')) {
                                cancelPurchase.mutate(purchase.id);
                              }
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-ink-soft">
                    {purchase.items.map((line) => (
                      <li key={line.id}>
                        {line.item.name} · {line.quantity} {line.item.unit} @ Rs {line.unitCost}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ClipboardList className="h-6 w-6" />}
              title="No purchases yet"
              description="Record what you order from a supplier. Stock updates once you mark a purchase received."
              action={
                canManage && (
                  <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setPurchaseModalOpen(true)}>
                    New purchase
                  </Button>
                )
              }
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {canManage && (
            <div className="flex justify-end">
              <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setSupplierModal({ open: true })}>
                Add supplier
              </Button>
            </div>
          )}

          {suppliersLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-28 w-full" />
              ))}
            </div>
          ) : suppliers && suppliers.length > 0 ? (
            <div className="grid gap-3 stagger-children sm:grid-cols-2 lg:grid-cols-3">
              {suppliers.map((supplier) => (
                <article key={supplier.id} className="panel-interactive p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-ink">{supplier.name}</h3>
                      {supplier.contactName && <p className="mt-0.5 text-xs text-ink-faint">{supplier.contactName}</p>}
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => setSupplierModal({ open: true, editing: supplier })} className="rounded-control p-1.5 text-ink-faint hover:bg-raised hover:text-ink">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Remove "${supplier.name}"?`)) deleteSupplier.mutate(supplier.id);
                          }}
                          className="rounded-control p-1.5 text-ink-faint hover:bg-chili-soft hover:text-chili"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-ink-soft">
                    {supplier.phone && <p>{supplier.phone}</p>}
                    {supplier.email && <p className="truncate">{supplier.email}</p>}
                    <p className="text-ink-faint">{supplier.purchaseCount} purchase(s)</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Truck className="h-6 w-6" />}
              title="No suppliers yet"
              description="Add who you buy stock from. Optional - a purchase can also be recorded without one."
              action={
                canManage && (
                  <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setSupplierModal({ open: true })}>
                    Add supplier
                  </Button>
                )
              }
            />
          )}
        </div>
      )}

      {supplierModal.open && (
        <SupplierModal editing={supplierModal.editing} onClose={() => setSupplierModal({ open: false })} />
      )}

      {purchaseModalOpen && (
        <PurchaseModal lockedBranchId={user?.scope.branchId ?? null} onClose={() => setPurchaseModalOpen(false)} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Truck;
  children: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-medium transition-colors',
        active ? 'bg-panel text-ink shadow-panel' : 'text-ink-soft hover:text-ink',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function SupplierModal({ editing, onClose }: { editing?: Supplier; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? '');
  const [contactName, setContactName] = useState(editing?.contactName ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [addressLine, setAddressLine] = useState(editing?.addressLine ?? '');

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? apiPut(endpoints.suppliers.detail(editing.id), payload) : apiPost(endpoints.suppliers.create, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(editing ? 'Supplier updated.' : 'Supplier added.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save that.'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit supplier' : 'Add supplier'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            isLoading={save.isPending}
            disabled={name.trim().length < 2}
            onClick={() =>
              save.mutate({
                name,
                contactName: contactName || null,
                phone: phone || null,
                email: email || null,
                addressLine: addressLine || null,
              })
            }
          >
            {editing ? 'Save changes' : 'Add supplier'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Metro Meat Suppliers" />
        <TextField label="Contact person" value={contactName} onChange={(event) => setContactName(event.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={11}
            inputMode="numeric"
          />
          <TextField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <TextField label="Address" value={addressLine} onChange={(event) => setAddressLine(event.target.value)} />
      </div>
    </Modal>
  );
}

interface PurchaseLineDraft {
  inventoryItemId: string;
  quantity: string;
  unitCost: string;
}

function PurchaseModal({ lockedBranchId, onClose }: { lockedBranchId: number | null; onClose: () => void }) {
  const queryClient = useQueryClient();

  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: () => apiGet<Branch[]>(endpoints.branches.list) });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => apiGet<Supplier[]>(endpoints.suppliers.list) });
  const { data: items } = useQuery({ queryKey: ['inventory', 'items'], queryFn: () => apiGet<InventoryItem[]>(endpoints.inventory.items) });

  const [branchId, setBranchId] = useState<string>(lockedBranchId ? String(lockedBranchId) : '');
  const [supplierId, setSupplierId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<PurchaseLineDraft[]>([{ inventoryItemId: '', quantity: '', unitCost: '' }]);

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiPost(endpoints.purchases.create, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      toast.success('Purchase created as a draft.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save that.'),
  });

  const addLine = () => setLines((current) => [...current, { inventoryItemId: '', quantity: '', unitCost: '' }]);
  const updateLine = (index: number, patch: Partial<PurchaseLineDraft>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const removeLine = (index: number) => setLines((current) => current.filter((_, i) => i !== index));

  const validLines = lines.filter((line) => line.inventoryItemId && Number(line.quantity) > 0);
  const canSave = branchId !== '' && validLines.length > 0;

  const total = validLines.reduce((sum, line) => sum + Number(line.quantity) * (Number(line.unitCost) || 0), 0);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="New purchase"
      description="Created as a draft. Stock updates only once you mark it received."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            isLoading={save.isPending}
            disabled={!canSave}
            onClick={() =>
              save.mutate({
                branchId: Number(branchId),
                supplierId: supplierId ? Number(supplierId) : undefined,
                note: note || undefined,
                items: validLines.map((line) => ({
                  inventoryItemId: Number(line.inventoryItemId),
                  quantity: Number(line.quantity),
                  unitCost: Number(line.unitCost) || 0,
                })),
              })
            }
          >
            Create draft
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {!lockedBranchId && (
            <div>
              <label className="field-label">Branch</label>
              <select className="field" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                <option value="" disabled>Choose a branch</option>
                {(branches ?? []).map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="field-label">Supplier</label>
            <select className="field" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">None</option>
              {(suppliers ?? []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t border-line pt-4">
          <div className="mb-2.5 flex items-center justify-between">
            <label className="field-label mb-0">Items</label>
            <button onClick={addLine} className="flex items-center gap-1 text-xs font-medium text-ember hover:underline">
              <Plus className="h-3 w-3" /> Add line
            </button>
          </div>

          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  className="field flex-1"
                  value={line.inventoryItemId}
                  onChange={(event) => updateLine(index, { inventoryItemId: event.target.value })}
                >
                  <option value="">Choose an item</option>
                  {(items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>
                  ))}
                </select>
                <input
                  type="number"
                  className="field w-24"
                  placeholder="Qty"
                  min={0}
                  step="0.001"
                  value={line.quantity}
                  onChange={(event) => updateLine(index, { quantity: event.target.value })}
                />
                <input
                  type="number"
                  className="field w-28"
                  placeholder="Rs/unit"
                  min={0}
                  step="0.01"
                  value={line.unitCost}
                  onChange={(event) => updateLine(index, { unitCost: event.target.value })}
                />
                <button onClick={() => removeLine(index)} className="shrink-0 rounded-control p-1.5 text-ink-faint hover:bg-chili-soft hover:text-chili">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {validLines.length > 0 && (
            <p className="mt-2.5 text-right text-sm text-ink-soft">
              Total: <span className="numeric font-semibold text-ink">Rs {total.toLocaleString()}</span>
            </p>
          )}
        </div>

        <div>
          <label className="field-label">Note</label>
          <textarea rows={2} className="field resize-none" value={note} onChange={(event) => setNote(event.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

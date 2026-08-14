import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Boxes, ListPlus, Package, Pencil, Plus, Trash2 } from 'lucide-react';
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
import type { Branch, InventoryItem, StockLevel } from '@/types/api';

/**
 * Stock, as inventoryService already models it: an append-only ledger with a
 * cached level. This page reads the level and writes to it only through the
 * /inventory/adjustments endpoint - there is no path here that sets an
 * absolute quantity.
 */

type Tab = 'levels' | 'items';

export default function InventoryPage() {
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const isBranchBound = user?.scope.branchId != null;

  const [tab, setTab] = useState<Tab>('levels');
  const [branchId, setBranchId] = useState<number | null>(user?.scope.branchId ?? null);
  const [itemModal, setItemModal] = useState<{ open: boolean; editing?: InventoryItem }>({ open: false });
  const [adjustLevel, setAdjustLevel] = useState<StockLevel | null>(null);

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => apiGet<Branch[]>(endpoints.branches.list),
  });

  const { data: levels, isLoading: levelsLoading } = useQuery({
    queryKey: ['inventory', 'levels', branchId],
    queryFn: () => apiGet<StockLevel[]>(endpoints.inventory.levels, { branchId: branchId ?? undefined }),
    enabled: tab === 'levels',
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['inventory', 'items'],
    queryFn: () => apiGet<InventoryItem[]>(endpoints.inventory.items),
  });

  const deleteItem = useMutation({
    mutationFn: (id: number) => apiDelete(endpoints.inventory.item(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Item removed.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not remove that.'),
  });

  const canAdjust = can('inventory.adjust');
  const lowCount = (levels ?? []).filter((level) => level.isLow).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Stock</p>
          <h1 className="mt-1.5 text-display-md text-ink">Inventory</h1>
          <p className="mt-2 text-sm text-ink-soft">
            What is on hand, at each branch. Every number here comes from the movement ledger, not a counter
            someone can accidentally overwrite.
          </p>
        </div>

        <div className="flex gap-2 rounded-control border border-line bg-raised p-1">
          <TabButton active={tab === 'levels'} onClick={() => setTab('levels')} icon={Boxes}>Stock levels</TabButton>
          <TabButton active={tab === 'items'} onClick={() => setTab('items')} icon={Package}>Items</TabButton>
        </div>
      </header>

      {lowCount > 0 && (
        <div className="flex items-center gap-2.5 rounded-control border border-chili/30 bg-chili-soft px-4 py-3 text-sm text-chili">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {lowCount} item{lowCount === 1 ? '' : 's'} at or below its reorder level.
        </div>
      )}

      {tab === 'levels' ? (
        <div className="space-y-4">
          {!isBranchBound && branches && branches.length > 1 && (
            <select
              className="field max-w-xs"
              value={branchId ?? ''}
              onChange={(event) => setBranchId(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          )}

          {levelsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : levels && levels.length > 0 ? (
            <div className="panel overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-faint">
                      <th className="px-4 py-3 font-medium">Item</th>
                      {!isBranchBound && <th className="px-4 py-3 font-medium">Branch</th>}
                      <th className="px-4 py-3 font-medium">On hand</th>
                      <th className="px-4 py-3 font-medium">Reorder at</th>
                      <th className="px-4 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {levels.map((level) => (
                      <tr key={`${level.branchId}-${level.item.id}`} className="border-b border-line last:border-0">
                        <td className="px-4 py-3 text-ink">{level.item.name}</td>
                        {!isBranchBound && <td className="px-4 py-3 text-ink-soft">{level.branch.name}</td>}
                        <td className={clsx('numeric px-4 py-3 font-medium', level.isLow ? 'text-chili' : 'text-ink')}>
                          {level.quantity} {level.item.unit}
                        </td>
                        <td className="numeric px-4 py-3 text-ink-faint">
                          {level.item.reorderLevel} {level.item.unit}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canAdjust && (
                            <Button size="sm" variant="secondary" onClick={() => setAdjustLevel(level)}>
                              Adjust
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Boxes className="h-6 w-6" />}
              title="Nothing tracked yet"
              description="Levels appear here once an item has moved - a purchase received, a sale, or a manual count."
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            {canAdjust && (
              <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setItemModal({ open: true })}>
                Add item
              </Button>
            )}
          </div>

          {itemsLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full" />
              ))}
            </div>
          ) : items && items.length > 0 ? (
            <div className="grid gap-3 stagger-children sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <article key={item.id} className="panel-interactive p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-ink">{item.name}</h3>
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {item.sku ? `${item.sku} · ` : ''}Unit: {item.unit}
                      </p>
                    </div>
                    {canAdjust && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => setItemModal({ open: true, editing: item })} className="rounded-control p-1.5 text-ink-faint hover:bg-raised hover:text-ink">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Remove "${item.name}"?`)) deleteItem.mutate(item.id);
                          }}
                          className="rounded-control p-1.5 text-ink-faint hover:bg-chili-soft hover:text-chili"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs">
                    <span className="text-ink-faint">Reorder at {item.reorderLevel} {item.unit}</span>
                    <span className="numeric text-ink-soft">Rs {item.costPerUnit}/{item.unit}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ListPlus className="h-6 w-6" />}
              title="No inventory items yet"
              description="Add ingredients or stock items here, then link a recipe to a menu item to track usage."
              action={
                canAdjust && (
                  <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setItemModal({ open: true })}>
                    Add item
                  </Button>
                )
              }
            />
          )}
        </div>
      )}

      {itemModal.open && (
        <ItemModal editing={itemModal.editing} onClose={() => setItemModal({ open: false })} />
      )}

      {adjustLevel && (
        <AdjustModal level={adjustLevel} onClose={() => setAdjustLevel(null)} />
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
  icon: typeof Boxes;
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

function ItemModal({ editing, onClose }: { editing?: InventoryItem; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name ?? '');
  const [sku, setSku] = useState(editing?.sku ?? '');
  const [unit, setUnit] = useState(editing?.unit ?? 'kg');
  const [reorderLevel, setReorderLevel] = useState(String(editing?.reorderLevel ?? 0));
  const [costPerUnit, setCostPerUnit] = useState(String(editing?.costPerUnit ?? 0));

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? apiPut(endpoints.inventory.item(editing.id), payload) : apiPost(endpoints.inventory.items, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success(editing ? 'Item updated.' : 'Item added.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save that.'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit inventory item' : 'Add inventory item'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            isLoading={save.isPending}
            disabled={name.trim().length < 2}
            onClick={() =>
              save.mutate({
                name,
                sku: sku || null,
                unit,
                reorderLevel: Number(reorderLevel) || 0,
                costPerUnit: Number(costPerUnit) || 0,
              })
            }
          >
            {editing ? 'Save changes' : 'Add item'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Chicken (boneless)" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="SKU" value={sku} onChange={(event) => setSku(event.target.value)} placeholder="Optional" />
          <TextField label="Unit" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="kg" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Reorder level"
            type="number"
            min={0}
            value={reorderLevel}
            onChange={(event) => setReorderLevel(event.target.value)}
            hint="Flagged as low once stock drops to this or below."
          />
          <TextField
            label="Cost per unit (Rs)"
            type="number"
            min={0}
            step="0.01"
            value={costPerUnit}
            onChange={(event) => setCostPerUnit(event.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}

function AdjustModal({ level, onClose }: { level: StockLevel; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [quantityDelta, setQuantityDelta] = useState('');
  const [note, setNote] = useState('');

  const adjust = useMutation({
    mutationFn: () =>
      apiPost(endpoints.inventory.adjustments, {
        branchId: level.branchId,
        inventoryItemId: level.item.id,
        quantityDelta: Number(quantityDelta),
        note: note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Stock adjusted.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not adjust that.'),
  });

  const delta = Number(quantityDelta);
  const canSave = quantityDelta !== '' && !Number.isNaN(delta) && delta !== 0;
  const projected = canSave ? level.quantity + delta : level.quantity;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Adjust ${level.item.name}`}
      description={`${level.branch.name} · currently ${level.quantity} ${level.item.unit}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button isLoading={adjust.isPending} disabled={!canSave} onClick={() => adjust.mutate()}>
            Record adjustment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label={`Change (${level.item.unit}) — positive to add, negative to remove`}
          type="number"
          step="0.001"
          value={quantityDelta}
          onChange={(event) => setQuantityDelta(event.target.value)}
          placeholder="-2.5"
        />

        {canSave && (
          <p className="text-xs text-ink-soft">
            New balance: <span className="numeric font-medium text-ink">{projected} {level.item.unit}</span>
          </p>
        )}

        <div>
          <label className="field-label">Reason</label>
          <textarea
            rows={2}
            className="field resize-none"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Stocktake correction, spoilage, …"
          />
        </div>
      </div>
    </Modal>
  );
}

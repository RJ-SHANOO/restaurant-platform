import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Printer, QrCode, RefreshCw, Trash2, Users, Pencil } from 'lucide-react';
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
import type { Branch, DiningTable, TableStatus } from '@/types/api';

/**
 * Tables and their QR codes.
 *
 * qrController already does the scan-to-menu resolve and the token rotation;
 * this page is where a table row gets created, and where the code that gets
 * printed and stuck to the table actually comes from.
 */

const STATUS_PILL: Record<TableStatus, string> = {
  available: 'pill-mint',
  occupied: 'pill-ember',
  reserved: 'pill-sky',
  out_of_service: 'pill-muted',
};

const STATUS_LABEL: Record<TableStatus, string> = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  out_of_service: 'Out of service',
};

/** The URL a scanned code sends a customer to - QrMenuPage, on this same site. */
function tableOrderUrl(qrToken: string): string {
  return `${window.location.origin}/t/${qrToken}`;
}

function qrImageUrl(data: string, size = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

export default function TablesPage() {
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const isBranchBound = user?.scope.branchId != null;

  const [tableModal, setTableModal] = useState<{ open: boolean; editing?: DiningTable }>({ open: false });
  const [qrModal, setQrModal] = useState<DiningTable | null>(null);

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => apiGet<Branch[]>(endpoints.branches.list),
  });

  const { data: tables, isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => apiGet<DiningTable[]>(endpoints.tables.list),
  });

  const deleteTable = useMutation({
    mutationFn: (id: number) => apiDelete(endpoints.tables.detail(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success('Table removed.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not remove that.'),
  });

  const rotateQr = useMutation({
    mutationFn: (id: number) => apiPost<{ id: number; label: string; qrToken: string }>(endpoints.tables.rotateQr(id)),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setQrModal((current) => (current && current.id === updated.id ? { ...current, qrToken: updated.qrToken } : current));
      toast.success('Code rotated. Reprint this table - the old code no longer works.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not rotate that.'),
  });

  const canCreate = can('tables.create');
  const canUpdate = can('tables.update');

  const groups = groupByBranch(tables ?? [], branches ?? []);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Service floor</p>
          <h1 className="mt-1.5 text-display-md text-ink">Tables &amp; QR</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Each table gets its own code. A customer who scans it lands straight on your menu for that table -
            no app, no typing a table number in.
          </p>
        </div>

        {canCreate && (
          <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setTableModal({ open: true })}>
            Add table
          </Button>
        )}
      </header>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      ) : tables && tables.length > 0 ? (
        <div className="space-y-6">
          {groups.map(({ branch, tables: branchTables }) => (
            <div key={branch?.id ?? 'unassigned'}>
              {!isBranchBound && branches && branches.length > 1 && (
                <p className="eyebrow mb-2.5">{branch?.name ?? 'Unassigned'}</p>
              )}
              <div className="grid gap-4 stagger-children md:grid-cols-2 xl:grid-cols-4">
                {branchTables.map((table) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    canUpdate={canUpdate}
                    onEdit={() => setTableModal({ open: true, editing: table })}
                    onShowQr={() => setQrModal(table)}
                    onDelete={() => {
                      if (confirm(`Remove table "${table.label}"?`)) {
                        deleteTable.mutate(table.id);
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<QrCode className="h-6 w-6" />}
          title="No tables yet"
          description="Add a table to generate its QR code. Print it and put it where a customer will see it."
          action={
            canCreate && (
              <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setTableModal({ open: true })}>
                Add table
              </Button>
            )
          }
        />
      )}

      {tableModal.open && (
        <TableFormModal
          editing={tableModal.editing}
          branches={branches ?? []}
          lockedBranchId={user?.scope.branchId ?? null}
          onClose={() => setTableModal({ open: false })}
        />
      )}

      {qrModal && (
        <Modal
          open
          onClose={() => setQrModal(null)}
          title={`Table ${qrModal.label}`}
          description={qrModal.branch?.name}
          footer={
            <>
              {canUpdate && (
                <Button
                  variant="secondary"
                  leadingIcon={<RefreshCw className="h-4 w-4" />}
                  isLoading={rotateQr.isPending}
                  onClick={() => {
                    if (confirm('Rotate this code? Every code already printed for this table stops working.')) {
                      rotateQr.mutate(qrModal.id);
                    }
                  }}
                >
                  Rotate code
                </Button>
              )}
              <Button leadingIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
                Print
              </Button>
            </>
          }
        >
          <div id="qr-print-area" className="flex flex-col items-center gap-4 py-2 text-center">
            <img
              src={qrImageUrl(tableOrderUrl(qrModal.qrToken))}
              alt={`QR code for table ${qrModal.label}`}
              className="h-56 w-56 rounded-control border border-line bg-white p-2"
            />
            <div>
              <p className="text-sm font-semibold text-ink">Table {qrModal.label}</p>
              <p className="numeric mt-1 break-all text-xs text-ink-faint">{tableOrderUrl(qrModal.qrToken)}</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function groupByBranch(
  tables: DiningTable[],
  branches: Branch[],
): { branch: Branch | undefined; tables: DiningTable[] }[] {
  const byBranch = new Map<number, DiningTable[]>();

  for (const table of tables) {
    const list = byBranch.get(table.branchId) ?? [];
    list.push(table);
    byBranch.set(table.branchId, list);
  }

  const known = branches
    .filter((branch) => byBranch.has(branch.id))
    .map((branch) => ({ branch: branch as Branch | undefined, tables: byBranch.get(branch.id)! }));

  // Tables whose branch was not in the list (should not normally happen).
  const unknown = [...byBranch.entries()]
    .filter(([branchId]) => !branches.some((branch) => branch.id === branchId))
    .map(([, list]) => ({ branch: undefined as Branch | undefined, tables: list }));

  return [...known, ...unknown];
}

function TableCard({
  table,
  canUpdate,
  onEdit,
  onShowQr,
  onDelete,
}: {
  table: DiningTable;
  canUpdate: boolean;
  onEdit: () => void;
  onShowQr: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="panel-interactive flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold text-ink">{table.label}</h3>
          {table.areaName && <p className="mt-0.5 text-xs text-ink-faint">{table.areaName}</p>}
        </div>
        <span className={clsx('pill shrink-0', STATUS_PILL[table.status])}>
          <span className="status-dot" />
          {STATUS_LABEL[table.status]}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-ink-soft">
        <Users className="h-3.5 w-3.5" />
        Seats {table.capacity}
      </div>

      <button
        onClick={onShowQr}
        className="mt-4 flex items-center justify-center gap-2 rounded-control border border-dashed border-line-strong bg-raised py-3 text-xs font-medium text-ink-soft transition-colors hover:border-ember/50 hover:text-ember"
      >
        <QrCode className="h-4 w-4" /> View QR code
      </button>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <span className="numeric text-xs text-ink-faint">{table.orderCount} order(s)</span>

        {canUpdate && (
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="rounded-control p-1.5 text-ink-faint hover:bg-raised hover:text-ink">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} className="rounded-control p-1.5 text-ink-faint hover:bg-chili-soft hover:text-chili">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function TableFormModal({
  editing,
  branches,
  lockedBranchId,
  onClose,
}: {
  editing?: DiningTable;
  branches: Branch[];
  lockedBranchId: number | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState<string>(
    editing ? String(editing.branchId) : lockedBranchId ? String(lockedBranchId) : branches[0] ? String(branches[0].id) : '',
  );
  const [label, setLabel] = useState(editing?.label ?? '');
  const [capacity, setCapacity] = useState(String(editing?.capacity ?? 4));
  const [areaName, setAreaName] = useState(editing?.areaName ?? '');
  const [status, setStatus] = useState<TableStatus>(editing?.status ?? 'available');

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? apiPut(endpoints.tables.detail(editing.id), payload) : apiPost(endpoints.tables.create, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success(editing ? 'Table updated.' : 'Table added.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save that.'),
  });

  const canSave = branchId !== '' && label.trim().length > 0 && Number(capacity) > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit table' : 'Add table'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            isLoading={save.isPending}
            disabled={!canSave}
            onClick={() =>
              save.mutate({
                branchId: Number(branchId),
                label,
                capacity: Number(capacity),
                areaName: areaName || null,
                status,
              })
            }
          >
            {editing ? 'Save changes' : 'Add table'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!lockedBranchId && branches.length > 1 && (
          <div>
            <label className="field-label">Branch</label>
            <select className="field" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="T-12" />
          <TextField
            label="Capacity"
            type="number"
            min={1}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </div>

        <TextField
          label="Area"
          value={areaName}
          onChange={(event) => setAreaName(event.target.value)}
          placeholder="Rooftop, Family hall, …"
        />

        <div>
          <label className="field-label">Status</label>
          <select className="field" value={status} onChange={(event) => setStatus(event.target.value as TableStatus)}>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { useAuth } from '@/context/AuthContext';
import type { Branch, Expense } from '@/types/api';

const CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Maintenance', 'Marketing', 'Supplies', 'Other'];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function ExpensesPage() {
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const isBranchBound = user?.scope.branchId != null;

  const [modal, setModal] = useState<{ open: boolean; editing?: Expense }>({ open: false });

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => apiGet<Branch[]>(endpoints.branches.list),
  });

  const { data: expenses, isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => apiGet<Expense[]>(endpoints.expenses.list),
  });

  const deleteExpense = useMutation({
    mutationFn: (id: number) => apiDelete(endpoints.expenses.detail(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense removed.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not remove that.'),
  });

  const canRecord = can('expenses.record');

  const { total, thisMonth } = useMemo(() => {
    const list = expenses ?? [];
    const currentMonth = todayIso().slice(0, 7);
    return {
      total: list.reduce((sum, expense) => sum + expense.amount, 0),
      thisMonth: list
        .filter((expense) => expense.incurredOn.slice(0, 7) === currentMonth)
        .reduce((sum, expense) => sum + expense.amount, 0),
    };
  }, [expenses]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Costs</p>
          <h1 className="mt-1.5 text-display-md text-ink">Expenses</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Rent, utilities and everything else that costs money but is not a purchase of stock.
          </p>
        </div>

        {canRecord && (
          <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setModal({ open: true })}>
            Record expense
          </Button>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="This month" value={`Rs ${thisMonth.toLocaleString()}`} icon={<Banknote className="h-4 w-4" />} tone="chili" />
        <StatCard label="All time" value={`Rs ${total.toLocaleString()}`} icon={<Receipt className="h-4 w-4" />} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : expenses && expenses.length > 0 ? (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-faint">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  {!isBranchBound && <th className="px-4 py-3 font-medium">Branch</th>}
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id} className="border-b border-line last:border-0">
                    <td className="numeric px-4 py-3 text-ink-soft">{expense.incurredOn.slice(0, 10)}</td>
                    <td className="px-4 py-3"><span className="pill pill-muted">{expense.category}</span></td>
                    <td className="px-4 py-3 text-ink">{expense.description}</td>
                    {!isBranchBound && (
                      <td className="px-4 py-3 text-ink-soft">{expense.branch?.name ?? 'Whole restaurant'}</td>
                    )}
                    <td className="numeric px-4 py-3 text-right font-medium text-ink">
                      Rs {expense.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {canRecord && (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setModal({ open: true, editing: expense })} className="rounded-control p-1.5 text-ink-faint hover:bg-raised hover:text-ink">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Remove this expense?')) deleteExpense.mutate(expense.id);
                            }}
                            className="rounded-control p-1.5 text-ink-faint hover:bg-chili-soft hover:text-chili"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
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
          icon={<Receipt className="h-6 w-6" />}
          title="No expenses recorded"
          description="Rent, electricity, staff meals - anything that costs money outside a stock purchase."
          action={
            canRecord && (
              <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setModal({ open: true })}>
                Record expense
              </Button>
            )
          }
        />
      )}

      {modal.open && (
        <ExpenseModal
          editing={modal.editing}
          branches={branches ?? []}
          lockedBranchId={user?.scope.branchId ?? null}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  );
}

function ExpenseModal({
  editing,
  branches,
  lockedBranchId,
  onClose,
}: {
  editing?: Expense;
  branches: Branch[];
  lockedBranchId: number | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState<string>(
    editing?.branchId ? String(editing.branchId) : lockedBranchId ? String(lockedBranchId) : '',
  );
  const [category, setCategory] = useState(editing?.category ?? CATEGORIES[0]);
  const [description, setDescription] = useState(editing?.description ?? '');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [incurredOn, setIncurredOn] = useState(editing?.incurredOn.slice(0, 10) ?? todayIso());

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? apiPut(endpoints.expenses.detail(editing.id), payload) : apiPost(endpoints.expenses.create, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success(editing ? 'Expense updated.' : 'Expense recorded.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save that.'),
  });

  const parsedAmount = Number(amount);
  const canSave = description.trim().length >= 2 && parsedAmount > 0 && incurredOn !== '';

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit expense' : 'Record expense'}
      description={monthLabel(incurredOn)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            isLoading={save.isPending}
            disabled={!canSave}
            onClick={() =>
              save.mutate({
                branchId: branchId ? Number(branchId) : null,
                category,
                description,
                amount: parsedAmount,
                incurredOn,
              })
            }
          >
            {editing ? 'Save changes' : 'Record expense'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">Category</label>
            <select className="field" value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <TextField label="Date" type="date" value={incurredOn} onChange={(event) => setIncurredOn(event.target.value)} />
        </div>

        <TextField
          label="Description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="August electricity bill"
        />

        <TextField
          label="Amount (Rs)"
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />

        {!lockedBranchId && branches.length > 0 && (
          <div>
            <label className="field-label">Branch</label>
            <select className="field" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">Whole restaurant</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}

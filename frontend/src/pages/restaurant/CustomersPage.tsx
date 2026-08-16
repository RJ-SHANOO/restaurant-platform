import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type { Customer } from '@/types/api';

export default function CustomersPage() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; editing?: Customer }>({ open: false });

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => apiGet<Customer[]>(endpoints.customers.list),
  });

  const deleteCustomer = useMutation({
    mutationFn: (id: number) => apiDelete(endpoints.customers.detail(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer removed.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not remove that.'),
  });

  const canManage = can('customers.create') || can('customers.update');
  const canDelete = can('customers.delete');

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers ?? [];
    return (customers ?? []).filter(
      (customer) =>
        customer.fullName.toLowerCase().includes(term) || customer.phone.toLowerCase().includes(term),
    );
  }, [customers, search]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Guests</p>
          <h1 className="mt-1.5 text-display-md text-ink">Customers</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Kept for delivery addresses and order history - not required to take an order.
          </p>
        </div>

        {can('customers.create') && (
          <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setModal({ open: true })}>
            Add customer
          </Button>
        )}
      </header>

      <div className="max-w-sm">
        <TextField
          placeholder="Search by name or phone"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          leadingIcon={<Search className="h-4 w-4" />}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : visible.length > 0 ? (
        <div className="space-y-2">
          {visible.map((customer) => (
            <article key={customer.id} className="panel flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{customer.fullName}</p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {customer.phone}
                  {customer.email ? ` · ${customer.email}` : ''} · {customer.orderCount} order(s)
                </p>
                {customer.addressLine && <p className="mt-0.5 text-xs text-ink-soft">{customer.addressLine}</p>}
              </div>

              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  {can('customers.update') && (
                    <button
                      onClick={() => setModal({ open: true, editing: customer })}
                      className="rounded-control p-1.5 text-ink-faint hover:bg-raised hover:text-ink"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => {
                        if (confirm(`Remove "${customer.fullName}"?`)) deleteCustomer.mutate(customer.id);
                      }}
                      className="rounded-control p-1.5 text-ink-faint hover:bg-chili-soft hover:text-chili"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title={search ? 'No matches' : 'No customers yet'}
          description={
            search
              ? 'Try a different name or phone number.'
              : 'Add a customer to attach them to orders and see their order history.'
          }
          action={
            !search && can('customers.create') && (
              <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setModal({ open: true })}>
                Add customer
              </Button>
            )
          }
        />
      )}

      {modal.open && <CustomerModal editing={modal.editing} onClose={() => setModal({ open: false })} />}
    </div>
  );
}

function CustomerModal({ editing, onClose }: { editing?: Customer; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(editing?.fullName ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [addressLine, setAddressLine] = useState(editing?.addressLine ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? apiPut(endpoints.customers.detail(editing.id), payload) : apiPost(endpoints.customers.create, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(editing ? 'Customer updated.' : 'Customer added.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save that.'),
  });

  const canSave = fullName.trim().length >= 2 && phone.trim().length >= 6;

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit customer' : 'Add customer'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            isLoading={save.isPending}
            disabled={!canSave}
            onClick={() =>
              save.mutate({
                fullName,
                phone,
                email: email || null,
                addressLine: addressLine || null,
                notes: notes || null,
              })
            }
          >
            {editing ? 'Save changes' : 'Add customer'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Full name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Ahmed Raza" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="03001234567"
            maxLength={11}
            inputMode="numeric"
          />
          <TextField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <TextField label="Address" value={addressLine} onChange={(event) => setAddressLine(event.target.value)} />
        <div>
          <label className="field-label">Notes</label>
          <textarea rows={2} className="field resize-none" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

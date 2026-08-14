import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Shield, ShieldCheck, Trash2, Users } from 'lucide-react';
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
import type { Branch, Role, StaffMember } from '@/types/api';

type Tab = 'staff' | 'roles';

export default function StaffPage() {
  const { can, user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('staff');
  const [modal, setModal] = useState<{ open: boolean; editing?: StaffMember }>({ open: false });

  const { data: staff, isLoading: staffLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => apiGet<StaffMember[]>(endpoints.staff.list),
  });

  const { data: roles, isLoading: rolesLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => apiGet<Role[]>(endpoints.staff.roles),
  });

  const removeStaff = useMutation({
    mutationFn: (id: number) => apiDelete(endpoints.staff.detail(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member removed.');
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not remove that.'),
  });

  const canManage = can('staff.create') || can('staff.update');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Team</p>
          <h1 className="mt-1.5 text-display-md text-ink">Staff &amp; roles</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Who can sign in, and what each role is allowed to touch.
          </p>
        </div>

        <div className="flex gap-2 rounded-control border border-line bg-raised p-1">
          <TabButton active={tab === 'staff'} onClick={() => setTab('staff')} icon={Users}>Staff</TabButton>
          <TabButton active={tab === 'roles'} onClick={() => setTab('roles')} icon={Shield}>Roles</TabButton>
        </div>
      </header>

      {tab === 'staff' ? (
        <div className="space-y-4">
          {can('staff.create') && (
            <div className="flex justify-end">
              <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setModal({ open: true })}>
                Add staff
              </Button>
            </div>
          )}

          {staffLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : staff && staff.length > 0 ? (
            <div className="space-y-2">
              {staff.map((member) => (
                <article key={member.id} className="panel flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{member.fullName}</p>
                      <span className={clsx('pill', member.status === 'active' ? 'pill-mint' : 'pill-muted')}>
                        <span className="status-dot" />
                        {member.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {member.email}
                      {member.phone ? ` · ${member.phone}` : ''}
                      {member.role ? ` · ${member.role.name}` : ''}
                      {member.branch ? ` · ${member.branch.name}` : ' · Every branch'}
                    </p>
                  </div>

                  {canManage && member.id !== user?.id && (
                    <div className="flex shrink-0 items-center gap-1">
                      {can('staff.update') && (
                        <button
                          onClick={() => setModal({ open: true, editing: member })}
                          className="rounded-control p-1.5 text-ink-faint hover:bg-raised hover:text-ink"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {can('staff.delete') && (
                        <button
                          onClick={() => {
                            if (confirm(`Remove "${member.fullName}"?`)) removeStaff.mutate(member.id);
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
              title="No staff yet"
              description="Add the people who work here and the role each one holds."
              action={
                can('staff.create') && (
                  <Button leadingIcon={<Plus className="h-4 w-4" />} onClick={() => setModal({ open: true })}>
                    Add staff
                  </Button>
                )
              }
            />
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {rolesLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 w-full" />
              ))}
            </div>
          ) : (
            (roles ?? []).map((role) => (
              <article key={role.id} className="panel p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-ember" />
                  <h3 className="text-sm font-semibold text-ink">{role.name}</h3>
                  {role.isSystem && <span className="pill pill-muted">built-in</span>}
                </div>
                {role.description && <p className="mt-1 text-xs text-ink-soft">{role.description}</p>}

                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  {role.permissions.includes('*') ? (
                    <span className="pill pill-sky">Every permission</span>
                  ) : (
                    role.permissions.map((slug) => (
                      <span key={slug} className="rounded-control bg-raised px-2 py-0.5 text-[11px] text-ink-soft">
                        {slug}
                      </span>
                    ))
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      )}

      {modal.open && (
        <StaffModal editing={modal.editing} roles={roles ?? []} onClose={() => setModal({ open: false })} />
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
  icon: typeof Users;
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

function StaffModal({
  editing,
  roles,
  onClose,
}: {
  editing?: StaffMember;
  roles: Role[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: () => apiGet<Branch[]>(endpoints.branches.list) });

  const [fullName, setFullName] = useState(editing?.fullName ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [password, setPassword] = useState('');
  const [roleSlug, setRoleSlug] = useState(editing?.role?.slug ?? '');
  const [branchId, setBranchId] = useState(editing?.branch ? String(editing.branch.id) : '');
  const [status, setStatus] = useState<'active' | 'suspended'>(editing?.status ?? 'active');

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editing ? apiPut(endpoints.staff.detail(editing.id), payload) : apiPost(endpoints.staff.create, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success(editing ? 'Staff member updated.' : 'Staff member added.');
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : 'Could not save that.'),
  });

  const selectedRole = roles.find((role) => role.slug === roleSlug);
  const canSave =
    fullName.trim().length >= 2 &&
    email.includes('@') &&
    selectedRole !== undefined &&
    (editing || password.trim().length >= 8);

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit staff member' : 'Add staff member'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            isLoading={save.isPending}
            disabled={!canSave}
            onClick={() =>
              save.mutate({
                fullName,
                email,
                phone: phone || null,
                ...(editing ? {} : { password }),
                roleId: selectedRole!.id,
                branchId: branchId ? Number(branchId) : null,
                ...(editing ? { status } : {}),
              })
            }
          >
            {editing ? 'Save changes' : 'Add staff'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField label="Full name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <TextField label="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>

        {!editing && (
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint="At least 8 characters. They can be given this and asked to sign in."
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="field-label">Role</label>
            <select className="field" value={roleSlug} onChange={(event) => setRoleSlug(event.target.value)}>
              <option value="" disabled>Choose a role</option>
              {roles.map((role) => (
                <option key={role.id} value={role.slug}>{role.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">Branch</label>
            <select className="field" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">Every branch</option>
              {(branches ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
        </div>

        {editing && (
          <div>
            <label className="field-label">Status</label>
            <select className="field" value={status} onChange={(event) => setStatus(event.target.value as 'active' | 'suspended')}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}

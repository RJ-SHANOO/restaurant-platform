import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { useAuth } from '@/context/AuthContext';
import { PaymentMethodsManager } from '@/components/settings/PaymentMethodsManager';
import type { Branch } from '@/types/api';

/**
 * Standalone view of one branch's payment methods. An owner with more than
 * one branch picks which - PaymentMethod is branch-scoped, not shared across
 * a restaurant's branches.
 */
export default function PaymentMethodsPage() {
  const { user } = useAuth();
  const isBranchBound = user?.scope.branchId != null;

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => apiGet<Branch[]>(endpoints.branches.list),
  });

  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    user?.scope.branchId ? String(user.scope.branchId) : '',
  );

  const branchId = Number(selectedBranchId) || (branches?.[0]?.id ?? null);

  if (!branchId) {
    return null;
  }

  return (
    <div className="space-y-4">
      {!isBranchBound && branches && branches.length > 1 && (
        <select
          className="field w-auto"
          value={selectedBranchId || String(branches[0].id)}
          onChange={(event) => setSelectedBranchId(event.target.value)}
        >
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>
      )}

      <PaymentMethodsManager branchId={branchId} />
    </div>
  );
}

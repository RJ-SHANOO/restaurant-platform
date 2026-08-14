import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { UserRole } from '@/types/api';

interface ProtectedRouteProps {
  children: ReactNode;
  /** When set, only these roles may enter. */
  allowedRoles?: UserRole[];
  requiredPermission?: string;
}

/**
 * A convenience guard, not a security boundary.
 *
 * It stops a cashier from *seeing* the settlements screen. What actually stops
 * a cashier from *reading settlement data* is the policy on the API. Both exist
 * on purpose; only one of them is load-bearing.
 */
export function ProtectedRoute({ children, allowedRoles, requiredPermission }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, role, can } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ember" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/forbidden" replace />;
  }

  if (requiredPermission && !can(requiredPermission)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}

/** Sends a freshly signed-in user to the screen their role actually works in. */
export function landingPathForRole(role: UserRole | null): string {
  switch (role) {
    case 'super_admin':
      return '/platform';
    case 'cashier':
      return '/pos';
    case 'kitchen_staff':
      return '/kitchen';
    default:
      return '/app';
  }
}

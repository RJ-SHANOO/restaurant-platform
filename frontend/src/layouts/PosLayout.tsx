import { Outlet, useNavigate } from 'react-router-dom';
import { ChefHat, LogOut, Receipt } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

/**
 * Full-bleed, no sidebar, large touch targets.
 *
 * A cashier uses this screen on a 10" tablet with one hand while holding a card
 * machine in the other. Everything else in the app can afford navigation
 * chrome; this cannot.
 */
export function PosLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-void">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-panel px-4">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-ember" />
          <span className="font-display text-sm font-semibold text-ink">Counter</span>
        </div>

        <span className="hidden text-xs text-ink-faint sm:inline">
          {user?.scope.branchName ?? user?.scope.restaurantName}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => navigate('/kitchen')}
            className="btn btn-ghost"
            title="Kitchen display"
          >
            <ChefHat className="h-4 w-4" />
            <span className="hidden sm:inline">Kitchen</span>
          </button>

          <button
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
            className="btn btn-ghost"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden safe-bottom">
        <Outlet />
      </div>
    </div>
  );
}

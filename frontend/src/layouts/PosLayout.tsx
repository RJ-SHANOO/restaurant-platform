import type { ReactNode } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { ChefHat, LogOut, Receipt } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { NotificationBell } from '@/components/ui/NotificationBell';

/**
 * Full-bleed, no sidebar, large touch targets.
 *
 * A cashier or waiter uses this screen on a 10" tablet with one hand, the
 * other free for a card machine or a tray. Everything else in the app can
 * afford navigation chrome; this cannot.
 */
export function PosLayout({
  title = 'Counter',
  icon = <Receipt className="h-5 w-5 text-ember" />,
}: {
  title?: string;
  icon?: ReactNode;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-void">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-panel px-4">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-display text-sm font-semibold text-ink">{title}</span>
        </div>

        <span className="hidden text-xs text-ink-faint sm:inline">
          {user?.scope.branchName ?? user?.scope.restaurantName}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <NotificationBell linkToBoard={false} />

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

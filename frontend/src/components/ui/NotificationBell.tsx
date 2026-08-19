import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';

/**
 * Rings on a new order; clicking it clears the count and, where the current
 * role can see the order board, jumps there. A cashier on the POS screen has
 * no route to that board, so `linkToBoard` is off there - the click just
 * dismisses the badge.
 */
export function NotificationBell({ linkToBoard = true }: { linkToBoard?: boolean }) {
  const { unreadCount, clearUnread } = useNotifications();
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        clearUnread();
        if (linkToBoard) navigate('/app/orders');
      }}
      className="relative rounded-control p-2 text-ink-soft transition-colors hover:bg-raised hover:text-ink"
      aria-label={unreadCount > 0 ? `${unreadCount} new orders` : 'Orders'}
    >
      <Bell className="h-[18px] w-[18px]" />
      {unreadCount > 0 && (
        <span className="numeric absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[10px] font-bold text-[#1A1206]">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}

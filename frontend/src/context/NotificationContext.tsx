import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiGet } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { useAuth } from '@/context/AuthContext';
import { humanise } from '@/utils/format';
import type { Order } from '@/types/api';

interface NotificationContextValue {
  unreadCount: number;
  clearUnread: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

/**
 * A short two-note chime, synthesised with the Web Audio API so a new order
 * can be heard without shipping an audio file. Fails silently if the browser
 * has not unlocked audio yet (no gesture has happened) - it should never
 * block the app.
 */
function playChime() {
  try {
    const ctx = new AudioContext();
    [880, 1175].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const start = ctx.currentTime + index * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.32);
    });
    setTimeout(() => ctx.close(), 700);
  } catch {
    // Ignored - see comment above.
  }
}

/**
 * Polls for new orders for as long as someone is signed in, so a new order
 * announces itself - sound, toast, and a browser notification if the tab
 * isn't focused - no matter which screen the staff member is looking at.
 * Platform admins see no restaurant orders, so they are excluded.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  // null until the first poll resolves: that poll learns the current board
  // silently so nothing already on screen gets announced as "new".
  const knownIds = useRef<Set<number> | null>(null);

  useEffect(() => {
    knownIds.current = null;
    setUnreadCount(0);
  }, [user?.id]);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useQuery({
    queryKey: ['notifications', 'orders', user?.id],
    queryFn: async () => {
      const orders = await apiGet<Order[]>(endpoints.orders.list, { liveOnly: true, perPage: 50 });

      if (knownIds.current === null) {
        knownIds.current = new Set(orders.map((order) => order.id));
        return orders;
      }

      const fresh = orders.filter((order) => !knownIds.current!.has(order.id));
      fresh.forEach((order) => knownIds.current!.add(order.id));

      if (fresh.length > 0) {
        playChime();
        setUnreadCount((count) => count + fresh.length);

        fresh.forEach((order) => {
          toast.info(`New order ${order.orderNumber}`, {
            description: order.table?.label ?? humanise(order.orderType),
          });
        });

        if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('New order', {
            body: fresh.map((order) => order.orderNumber).join(', '),
          });
        }
      }

      return orders;
    },
    enabled: Boolean(user) && !user?.scope.isPlatformAdmin,
    refetchInterval: 8_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
  });

  return (
    <NotificationContext.Provider value={{ unreadCount, clearUnread: () => setUnreadCount(0) }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationProvider');
  return ctx;
}

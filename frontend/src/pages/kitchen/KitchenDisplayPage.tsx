import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChefHat, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { apiGet, apiPatch } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { KitchenTicketCard } from '@/components/shared/KitchenTicketCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import type { KitchenTicket } from '@/types/api';

/**
 * The pass.
 *
 * Full screen, no navigation, polls every ten seconds and re-renders the
 * elapsed clock every second so the ageing bars move smoothly rather than
 * jumping. A chef never taps anything except "start" and "ready".
 */
export default function KitchenDisplayPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [, forceClockTick] = useState(0);

  // The bars need to advance between polls, so the clock ticks locally.
  useEffect(() => {
    const interval = setInterval(() => forceClockTick((tick) => tick + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['kitchen', 'board'],
    queryFn: () => apiGet<KitchenTicket[]>(endpoints.kitchen.board),
    refetchInterval: 10_000,
  });

  const advance = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiPatch(endpoints.kitchen.ticketStatus(id), { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kitchen'] }),
    onError: () => toast.error('Could not update that ticket. Check the connection.'),
  });

  const queued = tickets?.filter((ticket) => ticket.status === 'queued') ?? [];
  const inProgress = tickets?.filter((ticket) => ticket.status === 'preparing') ?? [];

  return (
    <div className="min-h-screen bg-void">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-panel px-5">
        <ChefHat className="h-5 w-5 text-ember" />
        <div>
          <p className="font-display text-sm font-semibold leading-tight text-ink">The Pass</p>
          <p className="text-[11px] text-ink-faint">{user?.scope.branchName}</p>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="hidden gap-5 text-right sm:flex">
            <div>
              <p className="eyebrow">Queued</p>
              <p className="numeric text-lg font-bold text-ember">{queued.length}</p>
            </div>
            <div>
              <p className="eyebrow">Cooking</p>
              <p className="numeric text-lg font-bold text-sky">{inProgress.length}</p>
            </div>
          </div>

          {user?.primaryRole !== 'kitchen_staff' && (
            <button
              onClick={() => navigate(user?.scope.isPlatformAdmin ? '/platform' : '/app')}
              className="btn btn-ghost"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
          )}

          <button
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
            className="btn btn-ghost"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="p-5">
        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-64 w-full" />
            ))}
          </div>
        ) : tickets && tickets.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {tickets.map((ticket) => (
              <KitchenTicketCard
                key={ticket.id}
                ticket={ticket}
                onAdvance={(target, nextStatus) =>
                  advance.mutate({ id: target.id, status: nextStatus })
                }
              />
            ))}
          </div>
        ) : (
          <div className="pt-20">
            <EmptyState
              icon={<ChefHat className="h-6 w-6" />}
              title="The rail is clear"
              description="Confirmed orders land here the moment the counter accepts them."
            />
          </div>
        )}
      </main>
    </div>
  );
}

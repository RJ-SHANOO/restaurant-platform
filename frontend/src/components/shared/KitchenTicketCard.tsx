import clsx from 'clsx';
import { Flame, Timer } from 'lucide-react';
import type { KitchenTicket } from '@/types/api';
import { Button } from '@/components/ui/Button';

interface KitchenTicketCardProps {
  ticket: KitchenTicket;
  onAdvance: (ticket: KitchenTicket, nextStatus: 'preparing' | 'ready') => void;
}

/**
 * The signature component of the whole interface.
 *
 * It is drawn as a printed thermal slip rather than a card, because that is
 * physically what a kitchen ticket is. The bar across the top fills as the
 * ticket ages and changes colour at 70% and 100% of its target time, so a chef
 * scanning the rail from across the room reads urgency before reading words.
 *
 * There are no prices here by design - a kitchen display shows what to cook,
 * never what it sold for.
 */
export function KitchenTicketCard({ ticket, onAdvance }: KitchenTicketCardProps) {
  const { elapsedMinutes, targetMinutes, urgency } = ticket.timing;
  const fillPercentage = Math.min(100, (elapsedMinutes / Math.max(targetMinutes, 1)) * 100);

  const nextStatus = ticket.status === 'queued' ? 'preparing' : 'ready';
  const actionLabel = ticket.status === 'queued' ? 'Start cooking' : 'Mark ready';

  return (
    <article
      className={clsx(
        'kot-ticket animate-ticket-print',
        urgency === 'overdue' && 'border-chili/50',
        ticket.priority === 'rush' && 'shadow-ember-glow',
      )}
    >
      <div className="px-4">
        <div className="kot-age-bar">
          <div className="kot-age-fill" data-urgency={urgency} style={{ width: `${fillPercentage}%` }} />
        </div>

        <header className="mt-3 flex items-start justify-between gap-3">
          <div>
            <p className="numeric text-lg font-bold tracking-tight text-ink">
              {ticket.orderNumber}
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {ticket.tableLabel ?? ticket.orderType.replace('_', ' ')}
              {ticket.station && <span className="text-ink-faint"> · {ticket.station}</span>}
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            {ticket.priority === 'rush' && (
              <span className="pill pill-ember animate-ember-pulse">
                <Flame className="h-3 w-3" /> Rush
              </span>
            )}
            <span
              className={clsx(
                'numeric flex items-center gap-1 text-sm font-semibold',
                urgency === 'overdue' ? 'text-chili' : urgency === 'warning' ? 'text-ember' : 'text-ink-soft',
              )}
            >
              <Timer className="h-3.5 w-3.5" />
              {elapsedMinutes}m
            </span>
          </div>
        </header>

        <ul className="mt-3.5 space-y-2.5 border-t border-dashed border-line pt-3.5">
          {ticket.items.map((item) => (
            <li key={item.id} className="flex gap-3">
              <span className="numeric min-w-[2rem] rounded bg-raised px-1.5 py-0.5 text-center text-sm font-bold text-ember">
                {item.quantity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug text-ink">
                  {item.productName}
                  {item.variantName && (
                    <span className="text-ink-soft"> · {item.variantName}</span>
                  )}
                </p>
                {item.kitchenNote && (
                  <p className="mt-0.5 text-xs font-medium text-ember">{item.kitchenNote}</p>
                )}
              </div>
            </li>
          ))}
        </ul>

        {ticket.generalNote && (
          <p className="mt-3 rounded-control bg-ember-soft px-3 py-2 text-xs font-medium text-ember">
            {ticket.generalNote}
          </p>
        )}
      </div>

      <footer className="mt-4 border-t border-line p-3">
        <Button
          variant={ticket.status === 'queued' ? 'secondary' : 'primary'}
          size="sm"
          className="w-full"
          onClick={() => onAdvance(ticket, nextStatus)}
        >
          {actionLabel}
        </Button>
      </footer>
    </article>
  );
}

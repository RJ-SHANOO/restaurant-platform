import { prisma } from '../config/prisma';

/**
 * A record of who did something sensitive, and to which restaurant.
 *
 * Two kinds of caller: platform-console actions (creating a restaurant,
 * changing its terms or status, running a settlement) where restaurantId
 * names the tenant acted upon, and tenant-level sensitive actions a
 * restaurant's own staff take (cancelling or voiding an order, issuing a
 * refund) where restaurantId is the actor's own tenant. Both land in the
 * same table so "what happened to this restaurant" is one query either way.
 */
export const auditLogService = {
  async record(params: {
    // null identifies a system-triggered action (a scheduled job), not a
    // missing one - a human actor is always a real user id.
    actorId: number | null;
    restaurantId?: number | null;
    action: string;
    subjectType: string;
    subjectId?: number | null;
    oldValues?: unknown;
    newValues?: unknown;
  }) {
    await prisma.auditLog.create({
      data: {
        userId: params.actorId,
        restaurantId: params.restaurantId ?? null,
        action: params.action,
        subjectType: params.subjectType,
        subjectId: params.subjectId ?? null,
        oldValues: (params.oldValues ?? undefined) as never,
        newValues: (params.newValues ?? undefined) as never,
      },
    });
  },
};

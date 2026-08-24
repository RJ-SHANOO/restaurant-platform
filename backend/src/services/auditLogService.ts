import { prisma } from '../config/prisma';

/**
 * A record of what the Super Admin did, and to which restaurant.
 *
 * Scoped to platform-console actions for now - creating a restaurant,
 * changing its terms or status, running a settlement. A tenant's own
 * internal activity (orders, refunds, staff changes) is not logged here;
 * that would be a much larger, separate piece of work.
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

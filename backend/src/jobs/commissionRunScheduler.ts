import cron from 'node-cron';
import { prisma } from '../config/prisma';
import { commissionService } from '../services/commissionService';
import { auditLogService } from '../services/auditLogService';

/**
 * Automatically does, per restaurant, what the Super Admin's "Run Settlement"
 * button does by hand: closes any commission run whose cycle has elapsed,
 * then sweeps whatever closed runs are not yet settled.
 *
 * Runs hourly rather than at one fixed daily time because restaurants are
 * not all in the same timezone - a run only becomes due when its cycle's
 * last business day has fully passed *in that restaurant's own timezone*,
 * so a single UTC slot cannot catch every tenant promptly. Checking hourly
 * is cheap: createSettlement (via closeDueRuns) no-ops for a restaurant with
 * nothing due, so most ticks touch nothing.
 */
async function runDueSettlements() {
  const restaurants = await prisma.restaurant.findMany({
    where: { status: 'active', deletedAt: null },
    select: { id: true, settlementFrequency: true },
  });

  for (const restaurant of restaurants) {
    try {
      const settlement = await commissionService.createSettlement(
        restaurant.id,
        commissionService.periodStartFor(restaurant.settlementFrequency),
        new Date(),
      );

      if (!settlement) {
        continue;
      }

      await auditLogService.record({
        actorId: null,
        restaurantId: restaurant.id,
        action: 'settlement.auto_created',
        subjectType: 'Settlement',
        subjectId: settlement.id,
        newValues: { settlementNumber: settlement.settlementNumber },
      });
    } catch (error) {
      // One restaurant failing must never stop the rest from settling.
      console.error(`Scheduled settlement failed for restaurant ${restaurant.id}:`, error);
    }
  }
}

export function startCommissionRunScheduler() {
  cron.schedule('5 * * * *', () => void runDueSettlements());
}

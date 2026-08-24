import { Prisma, type CommissionCycle, type CommissionRun } from '@prisma/client';
import { prisma } from '../config/prisma';
import { money } from '../utils/money';
import { documentNumber } from '../utils/documentNumber';
import { addDays, businessDateFor, daysBetween } from '../utils/businessDate';

type Tx = Prisma.TransactionClient;

const CYCLE_LENGTH_DAYS: Record<CommissionCycle, number> = {
  daily: 1,
  every_3d: 3,
  weekly: 7,
};

/** Which fixed, non-overlapping window a business date falls into. */
function windowFor(cycle: CommissionCycle, anchor: Date, businessDate: Date) {
  const length = CYCLE_LENGTH_DAYS[cycle];
  const index = Math.floor(daysBetween(anchor, businessDate) / length);
  const cycleStart = addDays(anchor, index * length);
  const cycleEnd = addDays(cycleStart, length - 1);
  return { cycleStart, cycleEnd };
}

/** Gets (or opens) the run covering a business date, locked for this transaction. */
async function openRunFor(
  tx: Tx,
  restaurant: { id: number; commissionCycle: CommissionCycle; cycleAnchorDate: Date },
  businessDate: Date,
): Promise<CommissionRun> {
  const { cycleStart, cycleEnd } = windowFor(restaurant.commissionCycle, restaurant.cycleAnchorDate, businessDate);

  const run = await tx.commissionRun.upsert({
    where: { restaurantId_cycleStart_cycleEnd: { restaurantId: restaurant.id, cycleStart, cycleEnd } },
    create: { restaurantId: restaurant.id, cycleStart, cycleEnd },
    update: {},
  });

  // Serialises against a concurrent close of this exact run - either this
  // accrual lands before the close sees it, or after, never a race.
  await tx.$queryRaw<{ id: number }[]>`SELECT id FROM commission_runs WHERE id = ${run.id} FOR UPDATE`;

  return run;
}

/**
 * Where a commission entry actually lands. Ordinarily that is the run
 * covering its own business date. If that window has already closed - a
 * late-arriving charge or a refund reversal processed well after the fact -
 * it settles in whatever run is open today instead, with a pointer back to
 * the cycle it was really earned in.
 */
async function assignRun(
  tx: Tx,
  restaurant: { id: number; commissionCycle: CommissionCycle; cycleAnchorDate: Date; timezone: string },
  businessDate: Date,
): Promise<{ runId: number; originalRunId: number | null }> {
  const run = await openRunFor(tx, restaurant, businessDate);

  if (run.status === 'open') {
    return { runId: run.id, originalRunId: null };
  }

  const today = businessDateFor(restaurant.timezone);
  const todayRun = await openRunFor(tx, restaurant, today);

  return { runId: todayRun.id, originalRunId: run.id };
}

/**
 * Platform revenue.
 *
 * commission_entries is an immutable ledger. A refund does not edit the
 * original charge - it writes a negative reversal that nets against it. That
 * is what keeps a settlement reproducible months later: the arithmetic can be
 * re-run from the rows and will produce the same number.
 *
 * Entries are windowed into CommissionRun by business date, not by when the
 * row happened to be written - a bill settled after midnight, or a refund
 * processed days later, must still attribute to the cycle the order actually
 * belongs to.
 */
export const commissionService = {
  /**
   * Accrues commission on a fully-paid invoice.
   *
   * The rate is copied onto the entry rather than referenced. Changing a
   * restaurant's rate tomorrow must not rewrite what it already owed today.
   */
  async accrueForInvoice(
    tx: Tx,
    invoice: { id: number; restaurantId: number; grandTotal: Prisma.Decimal },
    businessDate: Date,
  ) {
    const existing = await tx.commissionEntry.findFirst({
      where: { invoiceId: invoice.id, type: 'charge' },
    });

    if (existing) {
      return existing;
    }

    const restaurant = await tx.restaurant.findUniqueOrThrow({
      where: { id: invoice.restaurantId },
      select: { commissionType: true, commissionValue: true, commissionCycle: true, cycleAnchorDate: true, timezone: true },
    });

    const base = money.from(invoice.grandTotal);

    const amount =
      restaurant.commissionType === 'percentage'
        ? money.percentageOf(base, restaurant.commissionValue)
        : money.round(money.from(restaurant.commissionValue));

    const { runId, originalRunId } = await assignRun(
      tx,
      { id: invoice.restaurantId, ...restaurant },
      businessDate,
    );

    return tx.commissionEntry.create({
      data: {
        restaurantId: invoice.restaurantId,
        invoiceId: invoice.id,
        type: 'charge',
        status: 'pending',
        baseAmount: base,
        amount,
        commissionType: restaurant.commissionType,
        commissionRate: restaurant.commissionValue,
        businessDate,
        runId,
        originalRunId,
      },
    });
  },

  /**
   * Gives back the platform's share of a refund, in proportion to how much of
   * the bill was returned. Refund half the bill, reverse half the commission.
   *
   * Attributed to the day the refund itself happens - a distinct economic
   * event from the original charge, not a rewrite of it.
   */
  async reverseForRefund(
    tx: Tx,
    invoice: { id: number; restaurantId: number; grandTotal: Prisma.Decimal },
    refundAmount: Prisma.Decimal,
  ) {
    const charge = await tx.commissionEntry.findFirst({
      where: { invoiceId: invoice.id, type: 'charge' },
    });

    if (!charge) {
      return null;
    }

    const total = money.from(invoice.grandTotal);

    if (total.lte(0)) {
      return null;
    }

    const proportion = money.from(refundAmount).div(total);
    const reversal = money.round(money.from(charge.amount).mul(proportion)).neg();

    const restaurant = await tx.restaurant.findUniqueOrThrow({
      where: { id: invoice.restaurantId },
      select: { commissionCycle: true, cycleAnchorDate: true, timezone: true },
    });

    const businessDate = businessDateFor(restaurant.timezone);
    const { runId, originalRunId } = await assignRun(
      tx,
      { id: invoice.restaurantId, ...restaurant },
      businessDate,
    );

    return tx.commissionEntry.create({
      data: {
        restaurantId: invoice.restaurantId,
        invoiceId: invoice.id,
        type: 'reversal',
        status: 'pending',
        baseAmount: money.from(refundAmount).neg(),
        amount: reversal,
        commissionType: charge.commissionType,
        commissionRate: charge.commissionRate,
        note: 'Reversal against refund',
        businessDate,
        runId,
        originalRunId,
      },
    });
  },

  /**
   * Closes every run whose window has fully elapsed for a restaurant. Totals
   * are recomputed from the entries at close time rather than carried as a
   * running counter, so a run closes with exactly what its rows say.
   *
   * A closed run is never reopened or re-sliced - a charge or reversal that
   * turns up for it afterwards is routed into today's run instead, by
   * assignRun above.
   */
  async closeDueRuns(restaurantId: number) {
    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { timezone: true },
    });

    const today = businessDateFor(restaurant.timezone);

    const dueRuns = await prisma.commissionRun.findMany({
      where: { restaurantId, status: 'open', cycleEnd: { lt: today } },
    });

    const closed: CommissionRun[] = [];

    for (const run of dueRuns) {
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM commission_runs WHERE id = ${run.id} FOR UPDATE`;

        const fresh = await tx.commissionRun.findUniqueOrThrow({ where: { id: run.id } });

        if (fresh.status === 'closed') {
          return null;
        }

        const entries = await tx.commissionEntry.findMany({ where: { runId: run.id } });

        return tx.commissionRun.update({
          where: { id: run.id },
          data: {
            status: 'closed',
            closedAt: new Date(),
            grossSales: money.sum(entries.map((entry) => money.from(entry.baseAmount))),
            commissionTotal: money.sum(entries.map((entry) => money.from(entry.amount))),
            entryCount: entries.length,
          },
        });
      });

      if (result) {
        closed.push(result);
      }
    }

    return closed;
  },

  /**
   * Changes which cycle a restaurant's runs are windowed by. Applies to the
   * next boundary only: a run already open keeps the length it was opened
   * with, so history already in progress is never re-sliced.
   */
  async changeCycle(restaurantId: number, cycle: CommissionCycle) {
    return prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { timezone: true, commissionCycle: true },
      });

      if (restaurant.commissionCycle === cycle) {
        return tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
      }

      const today = businessDateFor(restaurant.timezone);

      const openRun = await tx.commissionRun.findFirst({
        where: { restaurantId, status: 'open' },
        orderBy: { cycleEnd: 'desc' },
      });

      const nextAnchor = openRun && openRun.cycleEnd >= today ? addDays(openRun.cycleEnd, 1) : today;

      return tx.restaurant.update({
        where: { id: restaurantId },
        data: { commissionCycle: cycle, cycleAnchorDate: nextAnchor },
      });
    });
  },

  /**
   * Sweeps every closed, not-yet-settled run in a period into a settlement.
   *
   * Runs are marked settled and linked, so a run can never be swept twice
   * and every settlement can name exactly which cycles it covers. Closes
   * whatever runs have come due first - nothing else in the codebase calls
   * closeDueRuns, so without this a run past its cycle just sits open
   * forever and never becomes sweepable.
   */
  async createSettlement(restaurantId: number, periodStart: Date, periodEnd: Date) {
    await this.closeDueRuns(restaurantId);

    return prisma.$transaction(async (tx) => {
      const runs = await tx.commissionRun.findMany({
        where: {
          restaurantId,
          status: 'closed',
          settlementId: null,
          cycleEnd: { gte: periodStart, lte: periodEnd },
        },
      });

      if (runs.length === 0) {
        return null;
      }

      const entries = await tx.commissionEntry.findMany({
        where: { runId: { in: runs.map((run) => run.id) }, status: 'pending' },
      });

      if (entries.length === 0) {
        return null;
      }

      const settlementNumber = await documentNumber.forSettlement(tx, restaurantId);

      const commissionTotal = money.sum(entries.map((entry) => money.from(entry.amount)));
      const grossSales = money.sum(entries.map((entry) => money.from(entry.baseAmount)));

      const settlement = await tx.settlement.create({
        data: {
          restaurantId,
          settlementNumber,
          status: 'finalised',
          periodStart,
          periodEnd,
          grossSales,
          commissionTotal,
          entryCount: entries.length,
          finalisedAt: new Date(),
        },
      });

      await tx.commissionEntry.updateMany({
        where: { id: { in: entries.map((entry) => entry.id) } },
        data: { status: 'settled', settlementId: settlement.id },
      });

      await tx.commissionRun.updateMany({
        where: { id: { in: runs.map((run) => run.id) } },
        data: { settlementId: settlement.id },
      });

      return settlement;
    });
  },

  /** Where the period boundary falls for a restaurant's chosen frequency. */
  periodStartFor(frequency: string, now = new Date()): Date {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    if (frequency === 'daily') return start;
    if (frequency === 'every_2_days') {
      start.setDate(start.getDate() - 2);
      return start;
    }
    if (frequency === 'monthly') {
      start.setMonth(start.getMonth() - 1);
      return start;
    }

    start.setDate(start.getDate() - 7);
    return start;
  },

  /** What a restaurant currently owes, before any settlement is cut. */
  async outstandingFor(restaurantId: number) {
    const result = await prisma.commissionEntry.aggregate({
      where: { restaurantId, status: 'pending' },
      _sum: { amount: true },
      _count: true,
    });

    return {
      amount: Number(result._sum.amount ?? 0),
      entryCount: result._count,
    };
  },
};

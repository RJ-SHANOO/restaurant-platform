import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { money } from '../utils/money';
import { documentNumber } from '../utils/documentNumber';

type Tx = Prisma.TransactionClient;

/**
 * Platform revenue.
 *
 * commission_entries is an immutable ledger. A refund does not edit the
 * original charge - it writes a negative reversal that nets against it. That
 * is what keeps a settlement reproducible months later: the arithmetic can be
 * re-run from the rows and will produce the same number.
 */
export const commissionService = {
  /**
   * Accrues commission on a fully-paid invoice.
   *
   * The rate is copied onto the entry rather than referenced. Changing a
   * restaurant's rate tomorrow must not rewrite what it already owed today.
   */
  async accrueForInvoice(tx: Tx, invoice: { id: number; restaurantId: number; grandTotal: Prisma.Decimal }) {
    const existing = await tx.commissionEntry.findFirst({
      where: { invoiceId: invoice.id, type: 'charge' },
    });

    if (existing) {
      return existing;
    }

    const restaurant = await tx.restaurant.findUniqueOrThrow({
      where: { id: invoice.restaurantId },
      select: { commissionType: true, commissionValue: true },
    });

    const base = money.from(invoice.grandTotal);

    const amount =
      restaurant.commissionType === 'percentage'
        ? money.percentageOf(base, restaurant.commissionValue)
        : money.round(money.from(restaurant.commissionValue));

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
      },
    });
  },

  /**
   * Gives back the platform's share of a refund, in proportion to how much of
   * the bill was returned. Refund half the bill, reverse half the commission.
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
      },
    });
  },

  /**
   * Sweeps every pending entry for a restaurant into a settlement.
   *
   * Entries are marked settled and linked, so an entry can never be swept
   * twice and every settlement can name exactly which charges it covers.
   */
  async createSettlement(restaurantId: number, periodStart: Date, periodEnd: Date) {
    return prisma.$transaction(async (tx) => {
      const entries = await tx.commissionEntry.findMany({
        where: {
          restaurantId,
          status: 'pending',
          createdAt: { gte: periodStart, lte: periodEnd },
        },
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

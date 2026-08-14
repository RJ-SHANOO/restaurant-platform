import { prisma } from '../config/prisma';
import { money } from '../utils/money';

/**
 * Reports, built from data every other service already writes - nothing
 * here creates a row of its own. Revenue counts only completed orders, the
 * same rule commissionService uses: a cancelled or unpaid order never
 * becomes revenue just because a report was run.
 */

export interface ReportRangeFilters {
  branchId?: number;
  from: Date;
  to: Date;
}

export const reportService = {
  async salesSummary(restaurantId: number, filters: ReportRangeFilters) {
    const baseWhere = {
      restaurantId,
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
      placedAt: { gte: filters.from, lt: filters.to },
    };

    const [completedAggregate, statusCounts, refunds, expenses] = await Promise.all([
      prisma.order.aggregate({
        where: { ...baseWhere, status: 'completed' },
        _sum: {
          grandTotal: true,
          subtotal: true,
          discountAmount: true,
          taxAmount: true,
          serviceCharge: true,
        },
        _count: true,
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: true,
      }),
      prisma.refund.aggregate({
        where: {
          restaurantId,
          createdAt: { gte: filters.from, lt: filters.to },
          ...(filters.branchId ? { invoice: { branchId: filters.branchId } } : {}),
        },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: {
          restaurantId,
          deletedAt: null,
          incurredOn: { gte: filters.from, lt: filters.to },
          ...(filters.branchId ? { branchId: filters.branchId } : {}),
        },
        _sum: { amount: true },
      }),
    ]);

    const grossRevenue = money.from(completedAggregate._sum.grandTotal ?? 0);
    const refundTotal = money.from(refunds._sum.amount ?? 0);
    const netRevenue = money.round(grossRevenue.sub(refundTotal));
    const orderCount = completedAggregate._count;
    const averageOrderValue = orderCount > 0 ? money.round(grossRevenue.div(orderCount)) : money.zero();
    const expenseTotal = money.from(expenses._sum.amount ?? 0);

    return {
      range: { from: filters.from.toISOString(), to: filters.to.toISOString() },
      orders: {
        completed: orderCount,
        byStatus: Object.fromEntries(statusCounts.map((row) => [row.status, row._count])),
      },
      revenue: {
        gross: Number(grossRevenue),
        discounts: Number(completedAggregate._sum.discountAmount ?? 0),
        tax: Number(completedAggregate._sum.taxAmount ?? 0),
        serviceCharge: Number(completedAggregate._sum.serviceCharge ?? 0),
        refunds: Number(refundTotal),
        net: Number(netRevenue),
        averageOrderValue: Number(averageOrderValue),
      },
      expenses: Number(expenseTotal),
      netAfterExpenses: Number(money.round(netRevenue.sub(expenseTotal))),
    };
  },

  /** One point per calendar day that had at least one completed order. */
  async revenueByDay(restaurantId: number, filters: ReportRangeFilters) {
    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        status: 'completed',
        placedAt: { gte: filters.from, lt: filters.to },
      },
      select: { placedAt: true, grandTotal: true },
    });

    const byDay = new Map<string, { revenue: ReturnType<typeof money.zero>; orders: number }>();

    for (const order of orders) {
      const day = order.placedAt.toISOString().slice(0, 10);
      const bucket = byDay.get(day) ?? { revenue: money.zero(), orders: 0 };
      bucket.revenue = bucket.revenue.add(order.grandTotal);
      bucket.orders += 1;
      byDay.set(day, bucket);
    }

    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, bucket]) => ({ date, revenue: Number(bucket.revenue), orders: bucket.orders }));
  },

  /** Best sellers by revenue, for the range - what to keep pushing. */
  async topItems(restaurantId: number, filters: ReportRangeFilters, limit = 10) {
    const rows = await prisma.orderItem.groupBy({
      by: ['productId', 'productName'],
      where: {
        order: {
          restaurantId,
          ...(filters.branchId ? { branchId: filters.branchId } : {}),
          status: 'completed',
          placedAt: { gte: filters.from, lt: filters.to },
        },
      },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: limit,
    });

    return rows.map((row) => ({
      productId: row.productId,
      name: row.productName,
      quantity: row._sum.quantity ?? 0,
      revenue: Number(row._sum.lineTotal ?? 0),
    }));
  },

  /** What customers actually paid with. */
  async paymentBreakdown(restaurantId: number, filters: ReportRangeFilters) {
    const rows = await prisma.payment.groupBy({
      by: ['paymentMethodId'],
      where: {
        restaurantId,
        createdAt: { gte: filters.from, lt: filters.to },
        ...(filters.branchId ? { invoice: { branchId: filters.branchId } } : {}),
      },
      _sum: { amount: true },
      _count: true,
    });

    if (rows.length === 0) {
      return [];
    }

    const methods = await prisma.paymentMethod.findMany({
      where: { id: { in: rows.map((row) => row.paymentMethodId) } },
      select: { id: true, name: true },
    });
    const nameOf = (id: number) => methods.find((method) => method.id === id)?.name ?? 'Unknown';

    return rows
      .map((row) => ({
        paymentMethodId: row.paymentMethodId,
        name: nameOf(row.paymentMethodId),
        amount: Number(row._sum.amount ?? 0),
        count: row._count,
      }))
      .sort((a, b) => b.amount - a.amount);
  },
};

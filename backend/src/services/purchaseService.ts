import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { HttpError } from '../utils/apiResponse';
import { money } from '../utils/money';
import { documentNumber } from '../utils/documentNumber';
import { inventoryService } from './inventoryService';

/**
 * Purchases from a supplier: a draft until stock is actually in hand.
 *
 * A draft has no effect on stock at all - it is a plan. Only receiving it
 * writes to the inventory ledger, through the same inventoryService.record
 * every other movement goes through.
 */

export interface PurchaseItemInput {
  inventoryItemId: number;
  quantity: number;
  unitCost: number;
}

export interface CreatePurchaseInput {
  branchId: number;
  supplierId?: number;
  note?: string;
  items: PurchaseItemInput[];
}

const purchaseInclude = {
  items: { include: { item: true } },
  supplier: true,
  branch: { select: { id: true, name: true } },
};

export const purchaseService = {
  async list(restaurantId: number, filters: { branchId?: number; status?: string }) {
    return prisma.purchase.findMany({
      where: {
        restaurantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.status ? { status: filters.status as never } : {}),
      },
      include: purchaseInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(restaurantId: number, input: CreatePurchaseInput) {
    if (input.items.length === 0) {
      throw HttpError.validation({ items: ['A purchase needs at least one item.'] });
    }

    return prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({ where: { id: input.branchId, restaurantId, deletedAt: null } });
      if (!branch) {
        throw HttpError.notFound('That branch does not exist.');
      }

      if (input.supplierId) {
        const supplier = await tx.supplier.findFirst({
          where: { id: input.supplierId, restaurantId, deletedAt: null },
        });
        if (!supplier) {
          throw HttpError.validation({ supplierId: ['That supplier does not exist.'] });
        }
      }

      const itemIds = [...new Set(input.items.map((line) => line.inventoryItemId))];
      const items = await tx.inventoryItem.findMany({
        where: { id: { in: itemIds }, restaurantId, deletedAt: null },
      });
      if (items.length !== itemIds.length) {
        throw HttpError.validation({ items: ['One of those inventory items does not exist.'] });
      }

      const lines = input.items.map((line) => ({
        ...line,
        lineTotal: money.round(money.from(line.unitCost).mul(line.quantity)),
      }));
      const totalAmount = money.sum(lines.map((line) => line.lineTotal));

      const purchaseNumber = await documentNumber.forPurchase(tx, input.branchId, branch.code);

      return tx.purchase.create({
        data: {
          restaurantId,
          branchId: input.branchId,
          supplierId: input.supplierId ?? null,
          purchaseNumber,
          status: 'draft',
          totalAmount,
          note: input.note ?? null,
          items: {
            create: lines.map((line) => ({
              inventoryItemId: line.inventoryItemId,
              quantity: new Prisma.Decimal(line.quantity),
              unitCost: new Prisma.Decimal(line.unitCost),
              lineTotal: line.lineTotal,
            })),
          },
        },
        include: purchaseInclude,
      });
    });
  },

  /** Stock only moves here - a draft is a plan, receiving it is what happened. */
  async receive(restaurantId: number, id: number, actorId?: number) {
    return prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({ where: { id, restaurantId }, include: { items: true } });
      if (!purchase) {
        throw HttpError.notFound('That purchase does not exist.');
      }
      if (purchase.status !== 'draft') {
        throw HttpError.conflict('Only a draft purchase can be received.');
      }

      for (const line of purchase.items) {
        // eslint-disable-next-line no-await-in-loop
        await inventoryService.record(tx, {
          restaurantId,
          branchId: purchase.branchId,
          inventoryItemId: line.inventoryItemId,
          type: 'purchase',
          quantityDelta: line.quantity,
          unitCost: line.unitCost,
          sourceType: 'Purchase',
          sourceId: purchase.id,
          createdBy: actorId,
        });

        // The item's standing cost moves to the price actually paid.
        // eslint-disable-next-line no-await-in-loop
        await tx.inventoryItem.update({ where: { id: line.inventoryItemId }, data: { costPerUnit: line.unitCost } });
      }

      return tx.purchase.update({
        where: { id },
        data: { status: 'received', receivedAt: new Date() },
        include: purchaseInclude,
      });
    });
  },

  async cancel(restaurantId: number, id: number) {
    const purchase = await prisma.purchase.findFirst({ where: { id, restaurantId } });
    if (!purchase) {
      throw HttpError.notFound('That purchase does not exist.');
    }
    if (purchase.status !== 'draft') {
      throw HttpError.conflict('Only a draft purchase can be cancelled.');
    }

    return prisma.purchase.update({ where: { id }, data: { status: 'cancelled' }, include: purchaseInclude });
  },
};

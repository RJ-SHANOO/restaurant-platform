import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { HttpError } from '../utils/apiResponse';
import { money } from '../utils/money';

type Tx = Prisma.TransactionClient;

/**
 * Stock, as a ledger rather than a counter.
 *
 * Nothing here writes an absolute quantity. A sale appends a negative row; a
 * cancellation appends a positive one. branch_inventory_levels is a cached
 * projection of that ledger - if it ever drifts, replaying the transactions
 * rebuilds it exactly, which a bare counter column could never offer.
 */
export const inventoryService = {
  /**
   * Applies one movement and updates the cached level.
   *
   * The level row is read and written inside the caller's transaction. Under
   * Postgres's default isolation that is enough to keep two simultaneous sales
   * from both reading the same starting balance.
   */
  async record(
    tx: Tx,
    input: {
      restaurantId: number;
      branchId: number;
      inventoryItemId: number;
      type: Prisma.InventoryTransactionCreateInput['type'];
      quantityDelta: Prisma.Decimal | number;
      unitCost?: Prisma.Decimal | number;
      sourceType?: string;
      sourceId?: number;
      note?: string;
      createdBy?: number;
    },
  ) {
    const delta = new Prisma.Decimal(input.quantityDelta);

    const level = await tx.branchInventoryLevel.upsert({
      where: {
        branchId_inventoryItemId: {
          branchId: input.branchId,
          inventoryItemId: input.inventoryItemId,
        },
      },
      create: {
        branchId: input.branchId,
        inventoryItemId: input.inventoryItemId,
        quantity: delta,
      },
      update: { quantity: { increment: delta } },
    });

    return tx.inventoryTransaction.create({
      data: {
        restaurantId: input.restaurantId,
        branchId: input.branchId,
        inventoryItemId: input.inventoryItemId,
        type: input.type,
        quantityDelta: delta,
        balanceAfter: level.quantity,
        unitCost: new Prisma.Decimal(input.unitCost ?? 0),
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
        note: input.note ?? null,
        createdBy: input.createdBy ?? null,
      },
    });
  },

  /** Deducts recipe ingredients when an order is confirmed. */
  async commitForOrder(
    tx: Tx,
    order: { id: number; restaurantId: number; branchId: number;
             items: { productId: number; quantity: number }[] },
    actorId?: number,
  ) {
    await this.applyRecipeMovements(tx, order, 'sale', -1, actorId);
  },

  /** Puts ingredients back when an order is cancelled after confirmation. */
  async reverseForOrder(
    tx: Tx,
    order: { id: number; restaurantId: number; branchId: number;
             items: { productId: number; quantity: number }[] },
    actorId?: number,
  ) {
    await this.applyRecipeMovements(tx, order, 'reversal', 1, actorId);
  },

  async applyRecipeMovements(
    tx: Tx,
    order: { id: number; restaurantId: number; branchId: number;
             items: { productId: number; quantity: number }[] },
    type: 'sale' | 'reversal',
    sign: 1 | -1,
    actorId?: number,
  ) {
    const productIds = [...new Set(order.items.map((item) => item.productId))];

    const recipes = await tx.productRecipeItem.findMany({
      where: { productId: { in: productIds }, product: { tracksInventory: true } },
      include: { item: { select: { id: true, costPerUnit: true } } },
    });

    if (recipes.length === 0) {
      return;
    }

    for (const line of order.items) {
      const ingredients = recipes.filter((recipe) => recipe.productId === line.productId);

      for (const ingredient of ingredients) {
        const amount = money
          .from(ingredient.quantityPerUnit)
          .mul(line.quantity)
          .mul(sign);

        // eslint-disable-next-line no-await-in-loop
        await this.record(tx, {
          restaurantId: order.restaurantId,
          branchId: order.branchId,
          inventoryItemId: ingredient.inventoryItemId,
          type,
          quantityDelta: amount,
          unitCost: ingredient.item.costPerUnit,
          sourceType: 'Order',
          sourceId: order.id,
          createdBy: actorId,
        });
      }
    }
  },

  /**
   * A manual correction - a spot-check that found more or less than the
   * ledger thinks, spoilage, a stocktake. Same append-only shape as every
   * other movement; nothing here overwrites branchInventoryLevel directly.
   */
  async adjustStock(
    restaurantId: number,
    input: { branchId: number; inventoryItemId: number; quantityDelta: number; note?: string },
    actorId?: number,
  ) {
    return prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: { id: input.inventoryItemId, restaurantId, deletedAt: null },
      });
      if (!item) {
        throw HttpError.notFound('That inventory item does not exist.');
      }

      const branch = await tx.branch.findFirst({ where: { id: input.branchId, restaurantId, deletedAt: null } });
      if (!branch) {
        throw HttpError.notFound('That branch does not exist.');
      }

      return this.record(tx, {
        restaurantId,
        branchId: input.branchId,
        inventoryItemId: input.inventoryItemId,
        type: 'adjustment',
        quantityDelta: input.quantityDelta,
        unitCost: item.costPerUnit,
        sourceType: 'ManualAdjustment',
        note: input.note,
        createdBy: actorId,
      });
    });
  },

  /** Cached stock levels, joined with the item so a screen can show both at once. */
  async levelsForBranch(restaurantId: number, branchId?: number) {
    return prisma.branchInventoryLevel.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        item: { restaurantId, deletedAt: null },
      },
      include: { item: true, branch: { select: { id: true, name: true } } },
      orderBy: { item: { name: 'asc' } },
    });
  },

  /** The ledger itself, most recent first - what actually moved and why. */
  async transactions(
    restaurantId: number,
    filters: { branchId?: number; inventoryItemId?: number },
    take = 100,
  ) {
    return prisma.inventoryTransaction.findMany({
      where: {
        restaurantId,
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.inventoryItemId ? { inventoryItemId: filters.inventoryItemId } : {}),
      },
      include: {
        item: { select: { id: true, name: true, unit: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  },

  /** Items at or below their reorder level, for the low-stock alert. */
  async lowStockAlerts(restaurantId: number, branchId?: number) {
    return prisma.$transaction((tx) => this.lowStock(tx, restaurantId, branchId));
  },

  /** Items at or below their reorder level, for the low-stock alert. */
  async lowStock(tx: Tx, restaurantId: number, branchId?: number) {
    const levels = await tx.branchInventoryLevel.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        item: { restaurantId, deletedAt: null },
      },
      include: { item: true, branch: { select: { id: true, name: true } } },
    });

    return levels
      .filter((level) => level.quantity.lte(level.item.reorderLevel))
      .map((level) => ({
        itemId: level.item.id,
        itemName: level.item.name,
        unit: level.item.unit,
        branchId: level.branch.id,
        branchName: level.branch.name,
        quantity: Number(level.quantity),
        reorderLevel: Number(level.item.reorderLevel),
      }));
  },
};

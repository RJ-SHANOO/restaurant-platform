import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse, HttpError } from '../utils/apiResponse';
import { inventoryService } from '../services/inventoryService';

/**
 * Inventory items and their stock. The ledger itself (inventoryService.record)
 * already existed for order-driven movements; this adds the item catalog and
 * the manual-adjustment entry point a stocktake needs.
 */

const itemSchema = z.object({
  name: z.string().min(2).max(150),
  sku: z.string().max(60).optional().nullable(),
  unit: z.string().min(1).max(20).default('kg'),
  reorderLevel: z.number().min(0).default(0),
  costPerUnit: z.number().min(0).default(0),
});

const adjustmentSchema = z.object({
  branchId: z.number().int().positive(),
  inventoryItemId: z.number().int().positive(),
  quantityDelta: z.number().refine((value) => value !== 0, 'The adjustment cannot be zero.'),
  note: z.string().max(255).optional(),
});

export const inventoryController = {
  async itemIndex(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await req.db!.inventoryItem.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      });

      return apiResponse.success(res, items.map(serialiseItem));
    } catch (error) {
      next(error);
    }
  },

  async itemStore(req: Request, res: Response, next: NextFunction) {
    try {
      const input = itemSchema.parse(req.body);

      const item = await req.db!.inventoryItem.create({ data: input as never });
      return apiResponse.created(res, serialiseItem(item), `${item.name} added.`);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return next(HttpError.conflict('An item with that name already exists.'));
      }
      next(error);
    }
  },

  async itemUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const input = itemSchema.partial().parse(req.body);

      const item = await req.db!.inventoryItem.update({ where: { id }, data: input as never });
      return apiResponse.success(res, serialiseItem(item), 'Item updated.');
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return next(HttpError.conflict('An item with that name already exists.'));
      }
      next(error);
    }
  },

  async itemDestroy(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      await req.db!.inventoryItem.update({ where: { id }, data: { deletedAt: new Date() } });
      return apiResponse.noContent(res, 'Item removed.');
    } catch (error) {
      next(error);
    }
  },

  async levels(req: Request, res: Response, next: NextFunction) {
    try {
      const { branchId } = req.query;
      const levels = await inventoryService.levelsForBranch(
        req.tenantId!,
        typeof branchId === 'string' ? Number(branchId) : undefined,
      );

      return apiResponse.success(res, levels.map(serialiseLevel));
    } catch (error) {
      next(error);
    }
  },

  async transactions(req: Request, res: Response, next: NextFunction) {
    try {
      const { branchId, inventoryItemId } = req.query;
      const rows = await inventoryService.transactions(req.tenantId!, {
        branchId: typeof branchId === 'string' ? Number(branchId) : undefined,
        inventoryItemId: typeof inventoryItemId === 'string' ? Number(inventoryItemId) : undefined,
      });

      return apiResponse.success(res, rows.map(serialiseTransaction));
    } catch (error) {
      next(error);
    }
  },

  async lowStock(req: Request, res: Response, next: NextFunction) {
    try {
      const { branchId } = req.query;
      const alerts = await inventoryService.lowStockAlerts(
        req.tenantId!,
        typeof branchId === 'string' ? Number(branchId) : undefined,
      );

      return apiResponse.success(res, alerts);
    } catch (error) {
      next(error);
    }
  },

  async adjust(req: Request, res: Response, next: NextFunction) {
    try {
      const input = adjustmentSchema.parse(req.body);
      const transaction = await inventoryService.adjustStock(req.tenantId!, input, req.actor!.id);

      return apiResponse.created(res, serialiseTransaction(transaction), 'Stock adjusted.');
    } catch (error) {
      next(error);
    }
  },
};

function serialiseItem(item: Record<string, unknown>) {
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    reorderLevel: Number(item.reorderLevel),
    costPerUnit: Number(item.costPerUnit),
    createdAt: item.createdAt,
  };
}

function serialiseLevel(level: Record<string, unknown>) {
  const item = level.item as Record<string, unknown>;
  const branch = level.branch as { id: number; name: string };

  return {
    branchId: level.branchId,
    branch,
    item: serialiseItem(item),
    quantity: Number(level.quantity),
    isLow: Number(level.quantity) <= Number(item.reorderLevel),
    updatedAt: level.updatedAt,
  };
}

function serialiseTransaction(txn: Record<string, unknown>) {
  const item = txn.item as { id: number; name: string; unit: string } | undefined;
  const branch = txn.branch as { id: number; name: string } | undefined;

  return {
    id: txn.id,
    type: txn.type,
    item,
    branch,
    quantityDelta: Number(txn.quantityDelta),
    balanceAfter: Number(txn.balanceAfter),
    unitCost: Number(txn.unitCost),
    sourceType: txn.sourceType,
    sourceId: txn.sourceId,
    note: txn.note,
    createdAt: txn.createdAt,
  };
}

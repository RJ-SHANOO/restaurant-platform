import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse } from '../utils/apiResponse';
import { assertBranchAccess } from '../middleware/authorise';
import { purchaseService } from '../services/purchaseService';

const purchaseSchema = z.object({
  branchId: z.number().int().positive(),
  supplierId: z.number().int().positive().optional(),
  note: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        inventoryItemId: z.number().int().positive(),
        quantity: z.number().positive(),
        unitCost: z.number().min(0),
      }),
    )
    .min(1, 'A purchase needs at least one item.'),
});

export const purchaseController = {
  async index(req: Request, res: Response, next: NextFunction) {
    try {
      const { branchId, status } = req.query;

      const purchases = await purchaseService.list(req.tenantId!, {
        branchId: typeof branchId === 'string' ? Number(branchId) : undefined,
        status: typeof status === 'string' ? status : undefined,
      });

      return apiResponse.success(res, purchases.map(serialisePurchase));
    } catch (error) {
      next(error);
    }
  },

  async store(req: Request, res: Response, next: NextFunction) {
    try {
      const input = purchaseSchema.parse(req.body);
      assertBranchAccess(req, input.branchId);

      const purchase = await purchaseService.create(req.tenantId!, input);
      return apiResponse.created(res, serialisePurchase(purchase), `Purchase ${purchase.purchaseNumber} created.`);
    } catch (error) {
      next(error);
    }
  },

  async receive(req: Request, res: Response, next: NextFunction) {
    try {
      const purchase = await purchaseService.receive(req.tenantId!, Number(req.params.id), req.actor!.id);
      return apiResponse.success(res, serialisePurchase(purchase), 'Purchase received. Stock has been updated.');
    } catch (error) {
      next(error);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const purchase = await purchaseService.cancel(req.tenantId!, Number(req.params.id));
      return apiResponse.success(res, serialisePurchase(purchase), 'Purchase cancelled.');
    } catch (error) {
      next(error);
    }
  },
};

function serialisePurchase(purchase: Record<string, unknown>) {
  const items = (purchase.items as Record<string, unknown>[] | undefined) ?? [];
  const supplier = purchase.supplier as { id: number; name: string } | null;
  const branch = purchase.branch as { id: number; name: string } | undefined;

  return {
    id: purchase.id,
    purchaseNumber: purchase.purchaseNumber,
    status: purchase.status,
    branch,
    supplier: supplier ? { id: supplier.id, name: supplier.name } : null,
    totalAmount: Number(purchase.totalAmount),
    note: purchase.note,
    receivedAt: purchase.receivedAt,
    items: items.map((line) => {
      const item = line.item as { id: number; name: string; unit: string };
      return {
        id: line.id,
        item,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost),
        lineTotal: Number(line.lineTotal),
      };
    }),
    createdAt: purchase.createdAt,
  };
}

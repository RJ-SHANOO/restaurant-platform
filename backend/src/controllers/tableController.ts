import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse, HttpError } from '../utils/apiResponse';
import { assertBranchAccess } from '../middleware/authorise';
import { randomToken } from '../utils/documentNumber';

/**
 * Dining tables. QR generation and rotation live in qrController - this is
 * just the CRUD around the table row itself, in the branchController shape.
 */

const tableSchema = z.object({
  branchId: z.number().int().positive(),
  label: z.string().min(1).max(40),
  capacity: z.number().int().min(1).max(50).default(4),
  areaName: z.string().max(60).optional().nullable(),
  status: z.enum(['available', 'occupied', 'reserved', 'out_of_service']).default('available'),
});

export const tableController = {
  async index(req: Request, res: Response, next: NextFunction) {
    try {
      const { branchId, status } = req.query;

      const tables = await req.db!.diningTable.findMany({
        where: {
          deletedAt: null,
          // A branch-bound user sees only their own branch's tables.
          ...(req.actor!.branchId ? { branchId: req.actor!.branchId } : {}),
          ...(typeof branchId === 'string' ? { branchId: Number(branchId) } : {}),
          ...(typeof status === 'string' ? { status: status as never } : {}),
        },
        include: { branch: { select: { id: true, name: true } }, _count: { select: { orders: true } } },
        orderBy: [{ branchId: 'asc' }, { label: 'asc' }],
      });

      return apiResponse.success(res, tables.map(serialiseTable));
    } catch (error) {
      next(error);
    }
  },

  async store(req: Request, res: Response, next: NextFunction) {
    try {
      const input = tableSchema.parse(req.body);
      assertBranchAccess(req, input.branchId);

      const table = await req.db!.diningTable.create({
        data: { ...input, qrToken: randomToken(48) } as never,
        include: { branch: { select: { id: true, name: true } } },
      });

      return apiResponse.created(res, serialiseTable(table), `Table ${table.label} added.`);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return next(HttpError.conflict('A table with that label already exists in this branch.'));
      }
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const input = tableSchema.partial().parse(req.body);

      if (input.branchId !== undefined) {
        assertBranchAccess(req, input.branchId);
      }

      const table = await req.db!.diningTable.update({
        where: { id },
        data: input as never,
        include: { branch: { select: { id: true, name: true } } },
      });

      return apiResponse.success(res, serialiseTable(table), 'Table updated.');
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return next(HttpError.conflict('A table with that label already exists in this branch.'));
      }
      next(error);
    }
  },

  async destroy(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);

      const liveOrders = await req.db!.order.count({
        where: {
          diningTableId: id,
          status: { in: ['pending', 'confirmed', 'preparing', 'ready', 'served'] },
        },
      });

      if (liveOrders > 0) {
        throw HttpError.conflict(`This table has ${liveOrders} order(s) still in service. Close them first.`);
      }

      await req.db!.diningTable.update({ where: { id }, data: { deletedAt: new Date() } });

      return apiResponse.noContent(res, 'Table removed.');
    } catch (error) {
      next(error);
    }
  },
};

function serialiseTable(table: Record<string, unknown>) {
  const branch = table.branch as { id: number; name: string } | undefined;
  const counts = table._count as Record<string, number> | undefined;

  return {
    id: table.id,
    branchId: table.branchId,
    branch,
    label: table.label,
    capacity: table.capacity,
    areaName: table.areaName,
    status: table.status,
    qrToken: table.qrToken,
    orderCount: counts?.orders ?? 0,
    createdAt: table.createdAt,
  };
}

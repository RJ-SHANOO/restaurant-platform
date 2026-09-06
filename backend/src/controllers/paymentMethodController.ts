import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse, HttpError } from '../utils/apiResponse';
import { resolveBranchId } from '../middleware/authorise';

/**
 * How this branch accepts money at the counter - cash, a wallet, a card
 * terminal. Config only: what actually happened on a bill is a Payment row,
 * which is why a method already used in one is soft-deleted, never hard.
 *
 * Branch-scoped, not restaurant-scoped: two branches of the same restaurant
 * can accept different methods, and (when the branch's tax mode is
 * per_method) can tax the same method differently.
 */

const paymentMethodSchema = z.object({
  name: z.string().min(2).max(80),
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers and underscores only.'),
  kind: z.enum(['cash', 'card', 'wallet', 'bank', 'online', 'credit']).default('cash'),
  requiresReference: z.boolean().default(false),
  accountTitle: z.string().max(120).optional().nullable(),
  accountNumber: z.string().max(60).optional().nullable(),
  qrImageUrl: z.string().max(500).optional().nullable(),
  instructions: z.string().max(500).optional().nullable(),
  taxRate: z.number().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const paymentMethodController = {
  async index(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = resolveBranchId(req);
      const methods = await req.db!.paymentMethod.findMany({
        where: { branchId, deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      return apiResponse.success(res, methods.map(serialise));
    } catch (error) {
      next(error);
    }
  },

  async store(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = resolveBranchId(req);
      const input = paymentMethodSchema.parse(req.body);
      const method = await req.db!.paymentMethod.create({ data: { ...input, branchId } as never });
      return apiResponse.created(res, serialise(method), `${method.name} added.`);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return next(HttpError.conflict('A payment method with that code already exists on this branch.'));
      }
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = resolveBranchId(req);
      const id = Number(req.params.id);
      const input = paymentMethodSchema.partial().parse(req.body);

      const existing = await req.db!.paymentMethod.findFirst({ where: { id, branchId, deletedAt: null } });
      if (!existing) {
        throw HttpError.notFound('That payment method does not exist.');
      }

      const method = await req.db!.paymentMethod.update({ where: { id }, data: input as never });
      return apiResponse.success(res, serialise(method), 'Payment method updated.');
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return next(HttpError.conflict('A payment method with that code already exists on this branch.'));
      }
      next(error);
    }
  },

  /**
   * Always a soft delete: past payments and invoices keep pointing at this
   * row, and turning off the branch's last active method is refused - a
   * counter with nothing enabled cannot take payment at all.
   */
  async destroy(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = resolveBranchId(req);
      const id = Number(req.params.id);

      const existing = await req.db!.paymentMethod.findFirst({ where: { id, branchId, deletedAt: null } });
      if (!existing) {
        throw HttpError.notFound('That payment method does not exist.');
      }

      const remainingActive = await req.db!.paymentMethod.count({
        where: { branchId, deletedAt: null, isActive: true, id: { not: id } },
      });

      if (remainingActive === 0) {
        throw HttpError.conflict(
          'This is the only active payment method on this branch. Add another before removing it.',
        );
      }

      await req.db!.paymentMethod.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
      return apiResponse.noContent(res, 'Payment method removed.');
    } catch (error) {
      next(error);
    }
  },
};

function serialise(method: Record<string, unknown>) {
  return {
    id: method.id,
    branchId: method.branchId,
    name: method.name,
    code: method.code,
    kind: method.kind,
    requiresReference: method.requiresReference,
    accountTitle: method.accountTitle,
    accountNumber: method.accountNumber,
    qrImageUrl: method.qrImageUrl,
    instructions: method.instructions,
    taxRate: Number(method.taxRate),
    isActive: method.isActive,
    sortOrder: method.sortOrder,
    createdAt: method.createdAt,
  };
}

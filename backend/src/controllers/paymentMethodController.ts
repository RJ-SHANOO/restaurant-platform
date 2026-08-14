import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse, HttpError } from '../utils/apiResponse';

/**
 * How this restaurant accepts money at the counter - cash, a wallet, a card
 * terminal. Config only: what actually happened on a bill is a Payment row,
 * which is why a method already used in one cannot be hard-deleted.
 */

const paymentMethodSchema = z.object({
  name: z.string().min(2).max(80),
  code: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_]+$/, 'Lowercase letters, numbers and underscores only.'),
  kind: z.enum(['cash', 'card', 'wallet', 'bank', 'online']).default('cash'),
  requiresReference: z.boolean().default(false),
  accountTitle: z.string().max(120).optional().nullable(),
  accountNumber: z.string().max(60).optional().nullable(),
  qrImageUrl: z.string().max(500).optional().nullable(),
  instructions: z.string().max(500).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const paymentMethodController = {
  async index(req: Request, res: Response, next: NextFunction) {
    try {
      const methods = await req.db!.paymentMethod.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
      return apiResponse.success(res, methods.map(serialise));
    } catch (error) {
      next(error);
    }
  },

  async store(req: Request, res: Response, next: NextFunction) {
    try {
      const input = paymentMethodSchema.parse(req.body);
      const method = await req.db!.paymentMethod.create({ data: input as never });
      return apiResponse.created(res, serialise(method), `${method.name} added.`);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return next(HttpError.conflict('A payment method with that code already exists.'));
      }
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const input = paymentMethodSchema.partial().parse(req.body);
      const method = await req.db!.paymentMethod.update({ where: { id }, data: input as never });
      return apiResponse.success(res, serialise(method), 'Payment method updated.');
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return next(HttpError.conflict('A payment method with that code already exists.'));
      }
      next(error);
    }
  },

  async destroy(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);

      const used = await req.db!.payment.count({ where: { paymentMethodId: id } });
      if (used > 0) {
        throw HttpError.conflict(
          'This payment method has been used in past payments and cannot be removed. Turn it off instead.',
        );
      }

      await req.db!.paymentMethod.delete({ where: { id } });
      return apiResponse.noContent(res, 'Payment method removed.');
    } catch (error) {
      next(error);
    }
  },
};

function serialise(method: Record<string, unknown>) {
  return {
    id: method.id,
    name: method.name,
    code: method.code,
    kind: method.kind,
    requiresReference: method.requiresReference,
    accountTitle: method.accountTitle,
    accountNumber: method.accountNumber,
    qrImageUrl: method.qrImageUrl,
    instructions: method.instructions,
    isActive: method.isActive,
    sortOrder: method.sortOrder,
    createdAt: method.createdAt,
  };
}

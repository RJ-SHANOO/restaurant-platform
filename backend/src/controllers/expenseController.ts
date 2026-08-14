import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse } from '../utils/apiResponse';
import { assertBranchAccess } from '../middleware/authorise';

/**
 * Running costs - rent, utilities, salaries paid outside payroll. Unlike
 * orders and payments, an expense can be corrected in place: it never
 * reconciles against a customer's receipt, so there is nothing downstream
 * that a plain edit or soft delete could put out of sync.
 */

const expenseSchema = z.object({
  branchId: z.number().int().positive().optional().nullable(),
  category: z.string().min(2).max(60),
  description: z.string().min(2).max(255),
  amount: z.number().positive(),
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.'),
});

export const expenseController = {
  async index(req: Request, res: Response, next: NextFunction) {
    try {
      const { branchId, category, from, to } = req.query;

      const expenses = await req.db!.expense.findMany({
        where: {
          deletedAt: null,
          ...(req.actor!.branchId ? { branchId: req.actor!.branchId } : {}),
          ...(typeof branchId === 'string' ? { branchId: Number(branchId) } : {}),
          ...(typeof category === 'string' ? { category } : {}),
          ...(typeof from === 'string' || typeof to === 'string'
            ? {
                incurredOn: {
                  ...(typeof from === 'string' ? { gte: new Date(from) } : {}),
                  ...(typeof to === 'string' ? { lte: new Date(to) } : {}),
                },
              }
            : {}),
        },
        include: { branch: { select: { id: true, name: true } } },
        orderBy: { incurredOn: 'desc' },
      });

      return apiResponse.success(res, expenses.map(serialise));
    } catch (error) {
      next(error);
    }
  },

  async store(req: Request, res: Response, next: NextFunction) {
    try {
      const input = expenseSchema.parse(req.body);
      if (input.branchId) {
        assertBranchAccess(req, input.branchId);
      }

      const expense = await req.db!.expense.create({
        data: {
          ...input,
          incurredOn: new Date(input.incurredOn),
          recordedBy: req.actor!.id,
        } as never,
        include: { branch: { select: { id: true, name: true } } },
      });

      return apiResponse.created(res, serialise(expense), 'Expense recorded.');
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const input = expenseSchema.partial().parse(req.body);

      if (input.branchId) {
        assertBranchAccess(req, input.branchId);
      }

      const expense = await req.db!.expense.update({
        where: { id },
        data: {
          ...input,
          ...(input.incurredOn ? { incurredOn: new Date(input.incurredOn) } : {}),
        } as never,
        include: { branch: { select: { id: true, name: true } } },
      });

      return apiResponse.success(res, serialise(expense), 'Expense updated.');
    } catch (error) {
      next(error);
    }
  },

  async destroy(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      await req.db!.expense.update({ where: { id }, data: { deletedAt: new Date() } });
      return apiResponse.noContent(res, 'Expense removed.');
    } catch (error) {
      next(error);
    }
  },
};

function serialise(expense: Record<string, unknown>) {
  const branch = expense.branch as { id: number; name: string } | null;

  return {
    id: expense.id,
    branchId: expense.branchId,
    branch,
    category: expense.category,
    description: expense.description,
    amount: Number(expense.amount),
    incurredOn: expense.incurredOn,
    createdAt: expense.createdAt,
  };
}

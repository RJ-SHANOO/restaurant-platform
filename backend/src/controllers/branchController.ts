import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse, HttpError } from '../utils/apiResponse';
import { assertBranchAccess } from '../middleware/authorise';

/**
 * Branches. Also the reference implementation for every other CRUD controller
 * in this codebase - the shape here is the one to copy.
 */

const branchSchema = z.object({
  name: z.string().min(2).max(120),
  code: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9-]+$/, 'Use capital letters, numbers and hyphens only.'),
  addressLine: z.string().max(255).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  phone: z
    .string()
    .regex(/^0[0-9]{10}$/, 'Enter an 11-digit phone number starting with 0.')
    .optional()
    .nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  openingTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  closingTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  taxPercentage: z.number().min(0).max(100).default(0),
  serviceChargePercentage: z.number().min(0).max(100).default(0),
  estimatedPrepMinutes: z.number().int().min(1).max(180).default(20),
  acceptsQrOrders: z.boolean().default(true),
  acceptsDelivery: z.boolean().default(false),
  acceptsTakeaway: z.boolean().default(true),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const branchController = {
  async index(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, search } = req.query;

      const branches = await req.db!.branch.findMany({
        where: {
          deletedAt: null,
          // A branch-bound user sees only their own branch, whatever they ask
          // for. An owner has branchId null and sees all of them.
          ...(req.actor!.branchId ? { id: req.actor!.branchId } : {}),
          ...(typeof status === 'string' ? { status: status as 'active' | 'inactive' } : {}),
          ...(typeof search === 'string' && search
            ? { name: { contains: search, mode: 'insensitive' } }
            : {}),
        },
        include: { _count: { select: { diningTables: true, orders: true } } },
        orderBy: { name: 'asc' },
      });

      return apiResponse.success(res, branches.map(serialiseBranch));
    } catch (error) {
      next(error);
    }
  },

  async show(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      assertBranchAccess(req, id);

      const branch = await req.db!.branch.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { diningTables: true, orders: true, users: true } } },
      });

      if (!branch) {
        throw HttpError.notFound('That branch does not exist.');
      }

      return apiResponse.success(res, serialiseBranch(branch));
    } catch (error) {
      next(error);
    }
  },

  async store(req: Request, res: Response, next: NextFunction) {
    try {
      const input = branchSchema.parse(req.body);

      const branch = await req.db!.branch.create({
        data: input as never,
        include: { _count: { select: { diningTables: true, orders: true } } },
      });

      return apiResponse.created(res, serialiseBranch(branch), `${branch.name} added.`);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      assertBranchAccess(req, id);

      const input = branchSchema.partial().parse(req.body);

      const branch = await req.db!.branch.update({
        where: { id },
        data: input as never,
        include: { _count: { select: { diningTables: true, orders: true } } },
      });

      return apiResponse.success(res, serialiseBranch(branch), 'Branch updated.');
    } catch (error) {
      next(error);
    }
  },

  async destroy(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);

      const liveOrders = await req.db!.order.count({
        where: {
          branchId: id,
          status: { in: ['pending', 'confirmed', 'preparing', 'ready', 'served'] },
        },
      });

      if (liveOrders > 0) {
        throw HttpError.conflict(
          `This branch has ${liveOrders} order(s) still in service. Close them first.`,
        );
      }

      // Soft delete: history stays intact and old receipts still resolve.
      await req.db!.branch.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'inactive' },
      });

      return apiResponse.noContent(res, 'Branch closed.');
    } catch (error) {
      next(error);
    }
  },
};

function serialiseBranch(branch: Record<string, unknown>) {
  const counts = branch._count as Record<string, number> | undefined;

  return {
    id: branch.id,
    name: branch.name,
    code: branch.code,
    addressLine: branch.addressLine,
    city: branch.city,
    phone: branch.phone,
    location: {
      latitude: branch.latitude ? Number(branch.latitude) : null,
      longitude: branch.longitude ? Number(branch.longitude) : null,
    },
    hours: { opening: branch.openingTime, closing: branch.closingTime },
    charges: {
      taxPercentage: Number(branch.taxPercentage),
      serviceChargePercentage: Number(branch.serviceChargePercentage),
    },
    estimatedPrepMinutes: branch.estimatedPrepMinutes,
    capabilities: {
      acceptsQrOrders: branch.acceptsQrOrders,
      acceptsDelivery: branch.acceptsDelivery,
      acceptsTakeaway: branch.acceptsTakeaway,
    },
    status: branch.status,
    counts: counts
      ? { diningTables: counts.diningTables ?? 0, orders: counts.orders ?? 0, users: counts.users ?? 0 }
      : undefined,
    createdAt: branch.createdAt,
  };
}

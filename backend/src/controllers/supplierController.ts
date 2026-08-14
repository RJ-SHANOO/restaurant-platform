import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse } from '../utils/apiResponse';

const supplierSchema = z.object({
  name: z.string().min(2).max(150),
  contactName: z.string().max(120).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().max(150).optional().nullable(),
  addressLine: z.string().max(255).optional().nullable(),
});

export const supplierController = {
  async index(req: Request, res: Response, next: NextFunction) {
    try {
      const suppliers = await req.db!.supplier.findMany({
        where: { deletedAt: null },
        include: { _count: { select: { purchases: true } } },
        orderBy: { name: 'asc' },
      });

      return apiResponse.success(res, suppliers.map(serialiseSupplier));
    } catch (error) {
      next(error);
    }
  },

  async store(req: Request, res: Response, next: NextFunction) {
    try {
      const input = supplierSchema.parse(req.body);
      const supplier = await req.db!.supplier.create({ data: input as never });
      return apiResponse.created(res, serialiseSupplier(supplier), `${supplier.name} added.`);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const input = supplierSchema.partial().parse(req.body);
      const supplier = await req.db!.supplier.update({ where: { id }, data: input as never });
      return apiResponse.success(res, serialiseSupplier(supplier), 'Supplier updated.');
    } catch (error) {
      next(error);
    }
  },

  async destroy(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      await req.db!.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
      return apiResponse.noContent(res, 'Supplier removed.');
    } catch (error) {
      next(error);
    }
  },
};

function serialiseSupplier(supplier: Record<string, unknown>) {
  const counts = supplier._count as Record<string, number> | undefined;

  return {
    id: supplier.id,
    name: supplier.name,
    contactName: supplier.contactName,
    phone: supplier.phone,
    email: supplier.email,
    addressLine: supplier.addressLine,
    purchaseCount: counts?.purchases ?? 0,
    createdAt: supplier.createdAt,
  };
}

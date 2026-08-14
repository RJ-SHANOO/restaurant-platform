import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse, HttpError } from '../utils/apiResponse';

const customerSchema = z.object({
  fullName: z.string().min(2).max(150),
  phone: z.string().min(6).max(30),
  email: z.string().email().max(150).optional().nullable(),
  addressLine: z.string().max(255).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const customerController = {
  async index(req: Request, res: Response, next: NextFunction) {
    try {
      const { search } = req.query;

      const customers = await req.db!.customer.findMany({
        where: {
          deletedAt: null,
          ...(typeof search === 'string' && search
            ? {
                OR: [
                  { fullName: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        include: { _count: { select: { orders: true } } },
        orderBy: { fullName: 'asc' },
      });

      return apiResponse.success(res, customers.map(serialiseCustomer));
    } catch (error) {
      next(error);
    }
  },

  async show(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);

      const customer = await req.db!.customer.findFirst({
        where: { id, deletedAt: null },
        include: { _count: { select: { orders: true } } },
      });

      if (!customer) {
        throw HttpError.notFound('That customer does not exist.');
      }

      return apiResponse.success(res, serialiseCustomer(customer));
    } catch (error) {
      next(error);
    }
  },

  async store(req: Request, res: Response, next: NextFunction) {
    try {
      const input = customerSchema.parse(req.body);

      const existing = await req.db!.customer.findFirst({
        where: { phone: input.phone, deletedAt: null },
      });

      if (existing) {
        throw HttpError.validation({ phone: ['A customer with this phone number already exists.'] });
      }

      const customer = await req.db!.customer.create({ data: input as never });

      return apiResponse.created(res, serialiseCustomer(customer), `${customer.fullName} added.`);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const input = customerSchema.partial().parse(req.body);

      if (input.phone) {
        const existing = await req.db!.customer.findFirst({
          where: { phone: input.phone, deletedAt: null, id: { not: id } },
        });

        if (existing) {
          throw HttpError.validation({ phone: ['A customer with this phone number already exists.'] });
        }
      }

      const customer = await req.db!.customer.update({ where: { id }, data: input as never });

      return apiResponse.success(res, serialiseCustomer(customer), 'Customer updated.');
    } catch (error) {
      next(error);
    }
  },

  async destroy(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);

      // Soft delete: past orders keep pointing at this row for the receipt trail.
      await req.db!.customer.update({ where: { id }, data: { deletedAt: new Date() } });

      return apiResponse.noContent(res, 'Customer removed.');
    } catch (error) {
      next(error);
    }
  },
};

function serialiseCustomer(customer: Record<string, unknown>) {
  const counts = customer._count as Record<string, number> | undefined;

  return {
    id: customer.id,
    fullName: customer.fullName,
    phone: customer.phone,
    email: customer.email,
    addressLine: customer.addressLine,
    notes: customer.notes,
    orderCount: counts?.orders ?? 0,
    createdAt: customer.createdAt,
  };
}

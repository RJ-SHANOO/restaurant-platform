import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { apiResponse, HttpError } from '../utils/apiResponse';
import { commissionService } from '../services/commissionService';

/**
 * The Super Admin's console.
 *
 * These are the only endpoints that read across tenants, and they are the
 * reason the tenant client has an escape hatch at all. Everything here uses
 * the bare prisma client rather than req.db, which is exactly why the route is
 * gated on requirePlatformAdmin.
 */
export const platformController = {
  async dashboard(_req: Request, res: Response, next: NextFunction) {
    try {
      const [restaurantCount, activeCount, branchCount, orderCount, commission] =
        await Promise.all([
          prisma.restaurant.count({ where: { deletedAt: null } }),
          prisma.restaurant.count({ where: { status: 'active', deletedAt: null } }),
          prisma.branch.count({ where: { deletedAt: null } }),
          prisma.order.count(),
          prisma.commissionEntry.aggregate({ _sum: { amount: true } }),
        ]);

      const pendingSettlement = await prisma.commissionEntry.aggregate({
        where: { status: 'pending' },
        _sum: { amount: true },
      });

      return apiResponse.success(res, {
        restaurants: { total: restaurantCount, active: activeCount },
        branches: branchCount,
        orders: orderCount,
        commission: {
          accrued: Number(commission._sum.amount ?? 0),
          awaitingSettlement: Number(pendingSettlement._sum.amount ?? 0),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  async restaurants(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, search, perPage = '30', page = '1' } = req.query;

      const take = Math.min(Number(perPage) || 30, 100);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const where = {
        deletedAt: null,
        ...(typeof status === 'string' ? { status: status as never } : {}),
        ...(typeof search === 'string' && search
          ? { name: { contains: search, mode: 'insensitive' as const } }
          : {}),
      };

      const [restaurants, total] = await Promise.all([
        prisma.restaurant.findMany({
          where,
          include: { _count: { select: { branches: true, orders: true, users: true } } },
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        }),
        prisma.restaurant.count({ where }),
      ]);

      return apiResponse.paginated(res, restaurants.map(serialiseRestaurant), {
        currentPage: Number(page) || 1,
        perPage: take,
        total,
        lastPage: Math.max(Math.ceil(total / take), 1),
      });
    } catch (error) {
      next(error);
    }
  },

  async show(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurant = await prisma.restaurant.findFirst({
        where: { id: Number(req.params.id), deletedAt: null },
        include: {
          _count: { select: { branches: true, orders: true, users: true } },
          branches: { where: { deletedAt: null }, select: { id: true, name: true, code: true, status: true } },
          website: { select: { isPublished: true, primaryColor: true } },
        },
      });

      if (!restaurant) {
        throw HttpError.notFound('That restaurant does not exist.');
      }

      const outstanding = await commissionService.outstandingFor(restaurant.id);

      return apiResponse.success(res, {
        ...serialiseRestaurant(restaurant),
        branches: restaurant.branches,
        website: restaurant.website,
        outstandingCommission: outstanding,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Changes a restaurant's terms.
   *
   * Registration fixes the rate, but the platform can still renegotiate - a
   * volume discount, a promotional period. This only affects entries written
   * from now on: every existing commission entry carries its own snapshotted
   * rate, so last month's books do not move.
   */
  async updateCommercialTerms(req: Request, res: Response, next: NextFunction) {
    try {
      const input = z
        .object({
          commissionType: z.enum(['percentage', 'fixed']).optional(),
          commissionValue: z.number().min(0).max(100).optional(),
          settlementFrequency: z
            .enum(['daily', 'every_2_days', 'weekly', 'monthly'])
            .optional(),
        })
        .parse(req.body);

      const restaurant = await prisma.restaurant.update({
        where: { id: Number(req.params.id) },
        data: input,
        include: { _count: { select: { branches: true, orders: true, users: true } } },
      });

      return apiResponse.success(
        res,
        serialiseRestaurant(restaurant),
        'Terms updated. Existing commission entries are unchanged.',
      );
    } catch (error) {
      next(error);
    }
  },

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = z
        .object({ status: z.enum(['pending', 'active', 'suspended', 'closed']) })
        .parse(req.body);

      const restaurant = await prisma.restaurant.update({
        where: { id: Number(req.params.id) },
        data: { status },
        include: { _count: { select: { branches: true, orders: true, users: true } } },
      });

      return apiResponse.success(
        res,
        serialiseRestaurant(restaurant),
        status === 'suspended'
          ? 'Restaurant suspended. Its whole team is locked out until you reactivate it.'
          : `Restaurant marked ${status}.`,
      );
    } catch (error) {
      next(error);
    }
  },

  async settlements(req: Request, res: Response, next: NextFunction) {
    try {
      const settlements = await prisma.settlement.findMany({
        where: req.query.restaurantId
          ? { restaurantId: Number(req.query.restaurantId) }
          : undefined,
        include: { restaurant: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 60,
      });

      return apiResponse.success(
        res,
        settlements.map((settlement) => ({
          ...settlement,
          grossSales: Number(settlement.grossSales),
          commissionTotal: Number(settlement.commissionTotal),
        })),
      );
    } catch (error) {
      next(error);
    }
  },

  async runSettlement(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurantId = Number(req.params.id);

      const restaurant = await prisma.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { settlementFrequency: true },
      });

      const settlement = await commissionService.createSettlement(
        restaurantId,
        commissionService.periodStartFor(restaurant.settlementFrequency),
        new Date(),
      );

      if (!settlement) {
        return apiResponse.noContent(res, 'Nothing to settle for this period.');
      }

      return apiResponse.created(res, settlement, `Settlement ${settlement.settlementNumber} created.`);
    } catch (error) {
      next(error);
    }
  },
};

function serialiseRestaurant(restaurant: Record<string, any>) {
  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    contactEmail: restaurant.contactEmail,
    contactPhone: restaurant.contactPhone,
    city: restaurant.city,
    status: restaurant.status,
    commercialTerms: {
      commissionType: restaurant.commissionType,
      commissionValue: Number(restaurant.commissionValue),
      settlementFrequency: restaurant.settlementFrequency,
      agreedAt: restaurant.termsAgreedAt,
    },
    counts: restaurant._count
      ? {
          branches: restaurant._count.branches ?? 0,
          orders: restaurant._count.orders ?? 0,
          users: restaurant._count.users ?? 0,
        }
      : undefined,
    createdAt: restaurant.createdAt,
  };
}

import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { apiResponse, HttpError } from '../utils/apiResponse';

/**
 * The restaurant's own profile.
 *
 * Restaurant is the tenant root, so it is not one of TENANT_SCOPED_MODELS in
 * config/prisma.ts - there is no restaurantId column to filter by other than
 * its own id. req.tenantId is used directly instead of req.db here.
 *
 * Commercial terms (commission type/value, settlement frequency) are
 * deliberately not editable through this endpoint - a restaurant does not set
 * its own commission rate. That stays with platformController.
 */

const settingsSchema = z.object({
  name: z.string().min(2).max(150),
  contactEmail: z.string().email().max(150),
  contactPhone: z.string().min(6).max(30),
  addressLine: z.string().max(255).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  logoPath: z.string().max(255).optional().nullable(),
  currencyCode: z.string().length(3).optional(),
  timezone: z.string().max(64).optional(),
});

export const settingsController = {
  async show(req: Request, res: Response, next: NextFunction) {
    try {
      const restaurant = await prisma.restaurant.findUnique({ where: { id: req.tenantId! } });

      if (!restaurant) {
        throw HttpError.notFound('That restaurant does not exist.');
      }

      return apiResponse.success(res, serialiseRestaurant(restaurant));
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const input = settingsSchema.partial().parse(req.body);

      const restaurant = await prisma.restaurant.update({
        where: { id: req.tenantId! },
        data: input,
      });

      return apiResponse.success(res, serialiseRestaurant(restaurant), 'Settings updated.');
    } catch (error) {
      next(error);
    }
  },
};

function serialiseRestaurant(restaurant: Record<string, unknown>) {
  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    contactEmail: restaurant.contactEmail,
    contactPhone: restaurant.contactPhone,
    addressLine: restaurant.addressLine,
    city: restaurant.city,
    logoPath: restaurant.logoPath,
    currencyCode: restaurant.currencyCode,
    timezone: restaurant.timezone,
    status: restaurant.status,
    commercialTerms: {
      commissionType: restaurant.commissionType,
      commissionValue: Number(restaurant.commissionValue),
      settlementFrequency: restaurant.settlementFrequency,
    },
  };
}

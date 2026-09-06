import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse, HttpError } from '../utils/apiResponse';
import { resolveBranchId } from '../middleware/authorise';

/**
 * Mezbaan: a branch's own business profile, operating hours, tax mode and
 * online-ordering configuration. One row per branch (BranchSettings),
 * created on first use.
 *
 * This is config, not a receipt - changing a rate here never reaches back
 * into an order or invoice already written. See settingsService.resolveCharges
 * for where these values are actually applied at checkout.
 */

const businessSchema = z.object({
  businessName: z.string().min(2).max(150),
  phone: z.string().max(30).optional().nullable(),
  ntn: z.string().max(30).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  currencySymbol: z.string().min(1).max(10),
});

const operationsSchema = z.object({
  dateMode: z.enum(['calendar', 'business']),
  openingTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm, e.g. 09:00.')
    .optional()
    .nullable(),
  reportGrouping: z.enum(['day', 'shift']),
});

const taxSchema = z.object({
  taxMode: z.enum(['disabled', 'uniform', 'per_method', 'fixed']),
  uniformRate: z.number().min(0).max(100),
  fixedAmount: z.number().min(0),
  serviceChargeEnabled: z.boolean(),
  serviceChargeRate: z.number().min(0).max(100),
});

const onlineSchema = z.object({
  acceptOnlineOrders: z.boolean(),
  deliveryEnabled: z.boolean(),
  pickupEnabled: z.boolean(),
  deliveryFee: z.number().min(0),
  minimumOrder: z.number().min(0),
  deliveryRadiusKm: z.number().min(0),
});

const branchSettingsSchema = businessSchema
  .merge(operationsSchema)
  .merge(taxSchema)
  .merge(onlineSchema)
  .partial();

export const branchSettingsController = {
  async show(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = resolveBranchId(req);
      const settings = await getOrCreate(req, branchId);
      return apiResponse.success(res, serialise(settings));
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const branchId = resolveBranchId(req);
      const input = branchSettingsSchema.parse(req.body);

      const current = await getOrCreate(req, branchId);
      const next_ = { ...current, ...input };

      if (next_.dateMode === 'business' && !next_.openingTime) {
        throw HttpError.validation({
          openingTime: ['Set the hour a business day starts at before switching to business-day mode.'],
        });
      }

      const updated = await req.db!.branchSettings.update({
        where: { id: current.id },
        data: input,
      });

      return apiResponse.success(res, serialise(updated), 'Settings updated.');
    } catch (error) {
      next(error);
    }
  },
};

async function getOrCreate(req: Request, branchId: number) {
  const existing = await req.db!.branchSettings.findFirst({ where: { branchId } });
  if (existing) {
    return existing;
  }

  const branch = await req.db!.branch.findFirst({ where: { id: branchId }, select: { name: true } });
  if (!branch) {
    throw HttpError.notFound('That branch does not exist.');
  }

  return req.db!.branchSettings.create({ data: { branchId, businessName: branch.name } as never });
}

function serialise(settings: Record<string, unknown>) {
  return {
    id: settings.id,
    branchId: settings.branchId,
    businessName: settings.businessName,
    phone: settings.phone,
    ntn: settings.ntn,
    address: settings.address,
    currencySymbol: settings.currencySymbol,
    dateMode: settings.dateMode,
    openingTime: settings.openingTime,
    reportGrouping: settings.reportGrouping,
    taxMode: settings.taxMode,
    uniformRate: Number(settings.uniformRate),
    fixedAmount: Number(settings.fixedAmount),
    serviceChargeEnabled: settings.serviceChargeEnabled,
    serviceChargeRate: Number(settings.serviceChargeRate),
    acceptOnlineOrders: settings.acceptOnlineOrders,
    deliveryEnabled: settings.deliveryEnabled,
    pickupEnabled: settings.pickupEnabled,
    deliveryFee: Number(settings.deliveryFee),
    minimumOrder: Number(settings.minimumOrder),
    deliveryRadiusKm: Number(settings.deliveryRadiusKm),
    updatedAt: settings.updatedAt,
  };
}

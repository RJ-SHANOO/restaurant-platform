import type { NextFunction, Request, Response } from 'express';
import { apiResponse, HttpError } from '../utils/apiResponse';
import { reportService } from '../services/reportService';

/** Defaults to the trailing 30 days when no range is given. */
function parseRange(req: Request): { branchId?: number; from: Date; to: Date } {
  const { branchId, from, to } = req.query;

  const toDate = typeof to === 'string' ? new Date(`${to}T23:59:59.999`) : new Date();
  const fromDate =
    typeof from === 'string'
      ? new Date(`${from}T00:00:00.000`)
      : new Date(toDate.getTime() - 29 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw HttpError.validation({ from: ['Use dates in YYYY-MM-DD format.'] });
  }

  if (fromDate > toDate) {
    throw HttpError.validation({ from: ['The start date must be before the end date.'] });
  }

  return {
    branchId: typeof branchId === 'string' ? Number(branchId) : undefined,
    from: fromDate,
    to: toDate,
  };
}

export const reportController = {
  async summary(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = parseRange(req);
      const summary = await reportService.salesSummary(req.tenantId!, filters);
      return apiResponse.success(res, summary);
    } catch (error) {
      next(error);
    }
  },

  async revenueByDay(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = parseRange(req);
      const series = await reportService.revenueByDay(req.tenantId!, filters);
      return apiResponse.success(res, series);
    } catch (error) {
      next(error);
    }
  },

  async topItems(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = parseRange(req);
      const items = await reportService.topItems(req.tenantId!, filters);
      return apiResponse.success(res, items);
    } catch (error) {
      next(error);
    }
  },

  async paymentBreakdown(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = parseRange(req);
      const breakdown = await reportService.paymentBreakdown(req.tenantId!, filters);
      return apiResponse.success(res, breakdown);
    } catch (error) {
      next(error);
    }
  },
};

import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse, HttpError } from '../utils/apiResponse';
import { assertBranchAccess } from '../middleware/authorise';
import { ALLOWED_TRANSITIONS, orderInclude, orderService } from '../services/orderService';
import { auditLogService } from '../services/auditLogService';

const LIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'served'] as const;

// No price fields. Deliberately. The client says what was ordered; the server
// reads what it costs from the product row.
const createOrderSchema = z.object({
  branchId: z.number().int().positive(),
  diningTableId: z.number().int().positive().optional(),
  customerId: z.number().int().positive().optional(),
  orderType: z.enum(['dine_in', 'takeaway', 'delivery']).optional(),
  guestCount: z.number().int().positive().max(100).optional(),
  customerNote: z.string().max(500).optional(),
  idempotencyKey: z.string().max(64).optional(),
  orderTakerName: z.string().max(150).optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        productVariantId: z.number().int().positive().optional(),
        quantity: z.number().int().positive().max(99),
        modifierIds: z.array(z.number().int().positive()).optional(),
        kitchenNote: z.string().max(255).optional(),
      }),
    )
    .min(1, 'An order needs at least one item.'),
});

const transitionSchema = z.object({
  status: z.enum([
    'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled', 'voided',
  ]),
  reason: z.string().max(255).optional(),
});

export const orderController = {
  async index(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, liveOnly, channel, date, perPage = '30', page = '1' } = req.query;

      const take = Math.min(Number(perPage) || 30, 100);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const where = {
        // A branch-bound user only ever sees their own branch's orders.
        ...(req.actor!.branchId ? { branchId: req.actor!.branchId } : {}),
        ...(typeof status === 'string' ? { status: status as never } : {}),
        ...(liveOnly === 'true' ? { status: { in: LIVE_STATUSES as never } } : {}),
        ...(typeof channel === 'string' ? { channel: channel as never } : {}),
        ...(typeof date === 'string'
          ? {
              placedAt: {
                gte: new Date(`${date}T00:00:00`),
                lte: new Date(`${date}T23:59:59`),
              },
            }
          : {}),
      };

      const [orders, total] = await Promise.all([
        req.db!.order.findMany({
          where,
          include: orderInclude,
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        }),
        req.db!.order.count({ where }),
      ]);

      return apiResponse.paginated(res, orders.map(serialiseOrder), {
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
      const order = await req.db!.order.findFirst({
        where: { id: Number(req.params.id) },
        include: { ...orderInclude, statusHistory: { orderBy: { createdAt: 'asc' } } },
      });

      if (!order) {
        throw HttpError.notFound('That order does not exist.');
      }

      assertBranchAccess(req, order.branchId);

      return apiResponse.success(res, serialiseOrder(order));
    } catch (error) {
      next(error);
    }
  },

  async store(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createOrderSchema.parse(req.body);
      assertBranchAccess(req, input.branchId);

      const order = await orderService.create(
        req.tenantId!,
        // The order taker defaults to whoever is signed in at the till; a POS
        // operator can still attribute the order to someone else (a waiter
        // taking a table) by naming them explicitly.
        { ...input, channel: 'pos', orderTakerName: input.orderTakerName?.trim() || req.actor!.fullName },
        req.actor!.id,
      );

      return apiResponse.created(
        res,
        serialiseOrder(order),
        `Order ${order.orderNumber} created.`,
      );
    } catch (error) {
      next(error);
    }
  },

  async transition(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, reason } = transitionSchema.parse(req.body);

      // Cancelling and voiding are separately gated: a cashier can walk back a
      // mistake, but voiding a completed sale is a manager's decision.
      const needed =
        status === 'voided'
          ? 'orders.void'
          : status === 'cancelled'
            ? 'orders.cancel'
            : 'orders.updateStatus';

      if (!req.actor!.isPlatformAdmin && !req.actor!.permissions.includes(needed)) {
        throw HttpError.forbidden(`Your role does not include ${needed}.`);
      }

      const order = await orderService.transition(req.tenantId!, Number(req.params.id), status, {
        actorId: req.actor!.id,
        reason,
      });

      // Cancelling and voiding are the two order-lifecycle moves the standing
      // audit trail (OrderStatusHistory) isn't enough for on its own - they're
      // sensitive enough to want a single cross-entity log a restaurant owner
      // can query without joining every table that might have touched money.
      if (status === 'cancelled' || status === 'voided') {
        await auditLogService.record({
          actorId: req.actor!.id,
          restaurantId: req.tenantId!,
          action: status === 'voided' ? 'order.voided' : 'order.cancelled',
          subjectType: 'Order',
          subjectId: order.id,
          newValues: { status, reason },
        });
      }

      return apiResponse.success(res, serialiseOrder(order), `Order marked ${status}.`);
    } catch (error) {
      next(error);
    }
  },
};

export function serialiseOrder(order: Record<string, any>) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    branch: order.branch,
    table: order.diningTable,
    customer: order.customer,
    orderType: order.orderType,
    channel: order.channel,
    status: order.status,
    paymentStatus: order.paymentStatus,
    guestCount: order.guestCount,
    customerNote: order.customerNote,
    cancelReason: order.cancelReason,
    tokenNumber: order.tokenNumber,
    tableNumber: order.tableNumber,
    orderTakerName: order.orderTakerName,
    totals: {
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discountAmount),
      serviceChargePercent: Number(order.serviceChargePercent),
      serviceCharge: Number(order.serviceCharge),
      taxAmount: Number(order.taxAmount),
      deliveryFee: Number(order.deliveryFee),
      tipAmount: Number(order.tipAmount),
      grandTotal: Number(order.grandTotal),
    },
    items: order.items?.map((item: Record<string, any>) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      billableQuantity: item.quantity - item.cancelledQuantity,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
      modifierSummary: item.modifierSummary,
      kitchenNote: item.kitchenNote,
    })),
    invoice: order.invoice
      ? { ...order.invoice, grandTotal: Number(order.invoice.grandTotal) }
      : null,
    statusHistory: order.statusHistory,
    // Telling the client which moves are legal keeps the button labels correct
    // without the frontend having to reimplement the state machine.
    allowedNextStatuses: ALLOWED_TRANSITIONS[order.status as keyof typeof ALLOWED_TRANSITIONS] ?? [],
    timestamps: {
      placedAt: order.placedAt,
      confirmedAt: order.confirmedAt,
      readyAt: order.readyAt,
      completedAt: order.completedAt,
      createdAt: order.createdAt,
    },
  };
}

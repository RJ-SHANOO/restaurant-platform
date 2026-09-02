import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma, tenantClient } from '../config/prisma';
import { apiResponse, HttpError } from '../utils/apiResponse';
import { orderService } from '../services/orderService';
import { randomToken } from '../utils/documentNumber';

/**
 * QR table ordering.
 *
 * The customer never enters a table number and cannot send one: the request
 * body has no table field. The token in the URL is the credential, and it is
 * what identifies the table, the branch and the restaurant.
 */

const qrOrderSchema = z.object({
  idempotencyKey: z.string().max(64).optional(),
  customerNote: z.string().max(500).optional(),
  guestCount: z.number().int().positive().max(50).optional(),
  preferredPaymentMethodId: z.number().int().positive().optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        productVariantId: z.number().int().positive().optional(),
        quantity: z.number().int().positive().max(30),
        modifierIds: z.array(z.number().int().positive()).optional(),
        kitchenNote: z.string().max(255).optional(),
      }),
    )
    .min(1),
});

async function resolveTable(qrToken: string) {
  const table = await prisma.diningTable.findUnique({
    where: { qrToken },
    include: {
      restaurant: { select: { id: true, name: true, slug: true, status: true, currencyCode: true, website: true } },
      branch: {
        select: { id: true, name: true, status: true, acceptsQrOrders: true },
      },
    },
  });

  if (!table || table.deletedAt) {
    throw HttpError.notFound('This code is not active.');
  }

  if (table.restaurant.status !== 'active') {
    throw HttpError.notFound('This code is not active.');
  }

  if (table.branch.status !== 'active' || !table.branch.acceptsQrOrders) {
    throw HttpError.conflict('This branch is not taking QR orders right now.');
  }

  return table;
}

export const qrController = {
  /** Scan lands here: resolves the table and returns the menu with it. */
  async resolve(req: Request, res: Response, next: NextFunction) {
    try {
      const table = await resolveTable(req.params.qrToken);

      const categories = await prisma.category.findMany({
        where: { restaurantId: table.restaurant.id, isActive: true, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          products: {
            where: { isAvailable: true, deletedAt: null },
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              name: true,
              description: true,
              imageUrl: true,
              basePrice: true,
              variants: { select: { id: true, name: true, priceDelta: true, isDefault: true } },
              branchOverrides: {
                where: { branchId: table.branchId },
                select: { priceOverride: true, isAvailable: true },
              },
            },
          },
        },
      });

      const site = table.restaurant.website;

      const paymentMethods = await prisma.paymentMethod.findMany({
        where: { restaurantId: table.restaurant.id, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, kind: true },
      });

      return apiResponse.success(res, {
        restaurant: {
          name: table.restaurant.name,
          slug: table.restaurant.slug,
          currencyCode: table.restaurant.currencyCode,
          // The guest sees the restaurant's own colours, not the platform's.
          theme: site
            ? {
                primaryColor: site.primaryColor,
                secondaryColor: site.secondaryColor,
                backgroundShade: site.backgroundShade,
                fontFamily: site.fontFamily,
                logoUrl: site.logoUrl,
              }
            : null,
        },
        branch: { id: table.branch.id, name: table.branch.name },
        table: { label: table.label, capacity: table.capacity },
        paymentMethods,
        menu: categories
          .filter((category) => category.products.length > 0)
          .map((category) => ({
            id: category.id,
            name: category.name,
            products: category.products
              .filter((product) => product.branchOverrides[0]?.isAvailable !== false)
              .map((product) => ({
                id: product.id,
                name: product.name,
                description: product.description,
                imageUrl: product.imageUrl,
                price: Number(product.branchOverrides[0]?.priceOverride ?? product.basePrice),
                variants: product.variants.map((variant) => ({
                  ...variant,
                  priceDelta: Number(variant.priceDelta),
                })),
              })),
          })),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Places the order.
   *
   * It arrives as pending: a cashier still confirms it. That is deliberate - it
   * stops a passer-by from flooding a kitchen with orders nobody intends to pay
   * for.
   */
  async placeOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const input = qrOrderSchema.parse(req.body);
      const table = await resolveTable(req.params.qrToken);

      const order = await orderService.create(table.restaurant.id, {
        branchId: table.branchId,
        diningTableId: table.id,
        orderType: 'dine_in',
        channel: 'qr',
        guestCount: input.guestCount,
        customerNote: input.customerNote,
        idempotencyKey: input.idempotencyKey,
        preferredPaymentMethodId: input.preferredPaymentMethodId,
        items: input.items,
      });

      return apiResponse.created(
        res,
        {
          orderNumber: order.orderNumber,
          status: order.status,
          grandTotal: Number(order.grandTotal),
          table: table.label,
        },
        'Order sent. The counter is confirming it now.',
      );
    } catch (error) {
      next(error);
    }
  },

  /**
   * What the QR customer polls after placing an order: status, a rough ETA,
   * and - once the bill exists - what to pay and with which method. Scoped
   * to the same table the qrToken resolves to, not just the same restaurant,
   * so one guest's QR code cannot be used to browse another table's orders.
   */
  async status(req: Request, res: Response, next: NextFunction) {
    try {
      const table = await resolveTable(req.params.qrToken);

      const order = await prisma.order.findFirst({
        where: {
          orderNumber: req.params.orderNumber,
          restaurantId: table.restaurant.id,
          diningTableId: table.id,
        },
        include: {
          preferredPaymentMethod: { select: { id: true, name: true, kind: true } },
          invoice: {
            select: {
              invoiceNumber: true,
              status: true,
              grandTotal: true,
              paidAmount: true,
              payments: { select: { method: { select: { name: true } } } },
            },
          },
        },
      });

      if (!order) {
        throw HttpError.notFound('That order does not exist.');
      }

      return apiResponse.success(res, {
        orderNumber: order.orderNumber,
        status: order.status,
        placedAt: order.placedAt,
        estimatedReadyAt: order.estimatedReadyAt,
        preferredPaymentMethod: order.preferredPaymentMethod,
        grandTotal: Number(order.grandTotal),
        invoice: order.invoice
          ? {
              invoiceNumber: order.invoice.invoiceNumber,
              status: order.invoice.status,
              grandTotal: Number(order.invoice.grandTotal),
              paidAmount: Number(order.invoice.paidAmount),
              paidVia: order.invoice.payments[0]?.method.name ?? null,
            }
          : null,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Rotates a table's token, invalidating every printed code for it at once.
   * For when a code leaks, or a table is re-laid.
   */
  async rotateToken(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const db = tenantClient(req.tenantId!);

      const table = await db.diningTable.update({
        where: { id },
        data: { qrToken: randomToken(48) },
      });

      return apiResponse.success(
        res,
        { id: table.id, label: table.label, qrToken: table.qrToken },
        'Code rotated. Reprint the QR for this table - the old one no longer works.',
      );
    } catch (error) {
      next(error);
    }
  },
};

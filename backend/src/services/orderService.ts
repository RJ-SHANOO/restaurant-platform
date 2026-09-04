import { Prisma, type OrderStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { HttpError } from '../utils/apiResponse';
import { calculateOrderTotals, money } from '../utils/money';
import { documentNumber } from '../utils/documentNumber';
import { businessDateFor } from '../utils/businessDate';
import { kitchenService } from './kitchenService';
import { inventoryService } from './inventoryService';

/**
 * Orders: creation, pricing, and the state machine.
 */

/**
 * The whole state machine, in one readable place.
 *
 * There is no path from pending to completed that skips the kitchen. That is
 * the point of expressing it as data rather than as scattered if-statements:
 * the legal moves can be read at a glance and tested directly.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served', 'cancelled'],
  served: ['completed', 'voided'],
  completed: ['voided'],
  cancelled: [],
  voided: [],
};

export interface OrderItemInput {
  productId: number;
  productVariantId?: number;
  quantity: number;
  modifierIds?: number[];
  kitchenNote?: string;
}

export interface CreateOrderInput {
  branchId: number;
  diningTableId?: number;
  customerId?: number;
  orderType?: 'dine_in' | 'takeaway' | 'delivery';
  channel?: 'pos' | 'qr' | 'website' | 'phone';
  guestCount?: number;
  customerNote?: string;
  idempotencyKey?: string;
  orderTakerName?: string;
  preferredPaymentMethodId?: number;
  items: OrderItemInput[];
}

// An order can still take another round while it is open. Once it is
// completed, cancelled or voided, that tab is closed for good.
const APPENDABLE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'served'];

type Tx = Prisma.TransactionClient;

/**
 * Prices every requested line from the product row and the branch's
 * overrides - never from the caller. Shared by order creation and by adding
 * items to an order already placed, so the two can never price the same
 * product differently.
 */
async function buildOrderLines(
  tx: Tx,
  restaurantId: number,
  branchId: number,
  items: OrderItemInput[],
) {
  const productIds = [...new Set(items.map((item) => item.productId))];

  const products = await tx.product.findMany({
    where: { id: { in: productIds }, restaurantId, deletedAt: null },
    include: {
      variants: true,
      branchOverrides: { where: { branchId } },
      modifierGroups: { include: { group: { include: { modifiers: true } } } },
    },
  });

  const productMap = new Map(products.map((product) => [product.id, product]));

  const missing = productIds.filter((id) => !productMap.has(id));
  if (missing.length > 0) {
    throw HttpError.validation({
      items: [`These items are not on the menu: ${missing.join(', ')}`],
    });
  }

  return items.map((item) => {
    const product = productMap.get(item.productId)!;
    const override = product.branchOverrides[0];

    if (override && !override.isAvailable) {
      throw HttpError.conflict(`${product.name} is not available at this branch.`);
    }

    if (!product.isAvailable) {
      throw HttpError.conflict(`${product.name} is currently unavailable.`);
    }

    if (item.quantity < 1) {
      throw HttpError.validation({ items: ['Quantity must be at least 1.'] });
    }

    // Branch override wins over the restaurant-wide base price.
    const basePrice = money.from(override?.priceOverride ?? product.basePrice);

    const variant = item.productVariantId
      ? product.variants.find((candidate) => candidate.id === item.productVariantId)
      : undefined;

    if (item.productVariantId && !variant) {
      throw HttpError.validation({
        items: [`That option is not available for ${product.name}.`],
      });
    }

    const unitPrice = money.round(basePrice.add(money.from(variant?.priceDelta ?? 0)));

    const availableModifiers = product.modifierGroups.flatMap((link) => link.group.modifiers);

    const chosenModifiers = (item.modifierIds ?? [])
      .map((id) => availableModifiers.find((modifier) => modifier.id === id))
      .filter((modifier): modifier is NonNullable<typeof modifier> => Boolean(modifier));

    const modifierUnitTotal = money.sum(
      chosenModifiers.map((modifier) => money.from(modifier.priceDelta)),
    );

    const modifierTotal = money.round(modifierUnitTotal.mul(item.quantity));
    const lineTotal = money.round(unitPrice.mul(item.quantity).add(modifierTotal));

    return {
      productId: product.id,
      productVariantId: variant?.id ?? null,
      productName: product.name,
      variantName: variant?.name ?? null,
      quantity: item.quantity,
      unitPrice,
      modifierTotal,
      lineTotal,
      modifierSummary:
        chosenModifiers.length > 0
          ? chosenModifiers.map((modifier) => modifier.name).join(', ')
          : null,
      kitchenNote: item.kitchenNote?.slice(0, 255) ?? null,
    };
  });
}

export const orderService = {
  /**
   * Creates an order.
   *
   * Prices are read from the database, never from the input. CreateOrderInput
   * has no price field, and adding one would not help: the figures below come
   * from the product row and the branch's tax settings. The client says what
   * was ordered; the server says what it costs.
   */
  async create(restaurantId: number, input: CreateOrderInput, actorId?: number) {
    if (input.items.length === 0) {
      throw HttpError.validation({ items: ['An order needs at least one item.'] });
    }

    // Replaying a key returns the original order rather than creating a second
    // one. This is what makes an offline queue safe to flush twice.
    if (input.idempotencyKey) {
      const existing = await prisma.order.findFirst({
        where: { branchId: input.branchId, idempotencyKey: input.idempotencyKey },
        include: orderInclude,
      });

      if (existing) {
        return existing;
      }
    }

    try {
      return await orderService.createAttempt(restaurantId, input, actorId);
    } catch (error) {
      // Two submissions with the same key arrived close enough together that
      // both passed the check above before either committed. The unique
      // index on (branchId, idempotencyKey) is what actually stopped the
      // duplicate order; this just gives the loser the order the winner
      // created, instead of a raw conflict.
      if (
        input.idempotencyKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await prisma.order.findFirst({
          where: { branchId: input.branchId, idempotencyKey: input.idempotencyKey },
          include: orderInclude,
        });

        if (existing) {
          return existing;
        }
      }

      throw error;
    }
  },

  async createAttempt(restaurantId: number, input: CreateOrderInput, actorId?: number) {
    return prisma.$transaction(
      async (tx) => {
        const branch = await tx.branch.findFirst({
          where: { id: input.branchId, restaurantId, deletedAt: null },
          include: { restaurant: { select: { timezone: true } } },
        });

        if (!branch) {
          throw HttpError.notFound('That branch does not exist.');
        }

        if (branch.status !== 'active') {
          throw HttpError.conflict('That branch is not currently open for orders.');
        }

        const preferredPaymentMethod = input.preferredPaymentMethodId
          ? await tx.paymentMethod.findFirst({
              where: { id: input.preferredPaymentMethodId, restaurantId, isActive: true },
              select: { id: true },
            })
          : null;

        if (input.preferredPaymentMethodId && !preferredPaymentMethod) {
          throw HttpError.validation({
            preferredPaymentMethodId: ['That payment method is not available.'],
          });
        }

        const lines = await buildOrderLines(tx, restaurantId, input.branchId, input.items);

        const totals = calculateOrderTotals({
          subtotal: money.sum(lines.map((line) => line.lineTotal)),
          serviceChargePercentage: Number(branch.serviceChargePercentage),
          taxPercentage: Number(branch.taxPercentage),
        });

        const { orderNumber, sequence } = await documentNumber.forOrder(tx, branch.id, branch.code);

        // Copied, not joined - like OrderItem.productName, so a table renamed
        // later never changes what an already-printed receipt says.
        const diningTable = input.diningTableId
          ? await tx.diningTable.findFirst({
              where: { id: input.diningTableId, restaurantId, branchId: branch.id },
              select: { label: true },
            })
          : null;

        const order = await tx.order.create({
          data: {
            restaurantId,
            branchId: branch.id,
            orderNumber,
            diningTableId: input.diningTableId ?? null,
            customerId: input.customerId ?? null,
            orderType: input.orderType ?? 'dine_in',
            channel: input.channel ?? 'pos',
            status: 'pending',
            paymentStatus: 'unpaid',
            guestCount: input.guestCount ?? null,
            customerNote: input.customerNote?.slice(0, 500) ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            preferredPaymentMethodId: preferredPaymentMethod?.id ?? null,
            businessDate: businessDateFor(branch.restaurant.timezone),
            tokenNumber: sequence,
            tableNumber: diningTable?.label ?? null,
            orderTakerName: input.orderTakerName?.slice(0, 150) ?? null,
            subtotal: totals.subtotal,
            discountAmount: totals.discountAmount,
            serviceChargePercent: branch.serviceChargePercentage,
            serviceCharge: totals.serviceCharge,
            taxAmount: totals.taxAmount,
            grandTotal: totals.grandTotal,
            items: { create: lines },
            statusHistory: {
              create: { toStatus: 'pending', changedBy: actorId ?? null },
            },
          },
          include: orderInclude,
        });

        if (input.diningTableId) {
          await tx.diningTable.updateMany({
            where: { id: input.diningTableId, restaurantId },
            data: { status: 'occupied' },
          });
        }

        return order;
      },
      { timeout: 15_000 },
    );
  },

  /**
   * Moves an order to a new status and runs that transition's side effects.
   *
   * This is the only place a status changes. Every move is validated against
   * ALLOWED_TRANSITIONS and recorded in order_status_histories with who did it
   * and why - so "who cancelled this" always has an answer.
   */
  async transition(
    restaurantId: number,
    orderId: number,
    toStatus: OrderStatus,
    options: { actorId?: number; reason?: string } = {},
  ) {
    return prisma.$transaction(
      async (tx) => {
        // Locks the row before anything reads it. Two transitions racing on
        // the same order (a double-tapped "Confirm", a retried request) would
        // otherwise both read the same starting status, both pass the check
        // below, and both run the side effects further down - a second full
        // set of kitchen tickets, stock deducted twice. The second call now
        // queues behind the first and re-reads the status the first one left
        // behind, so it either no-ops cleanly or is rejected as illegal,
        // never repeats what the first already did.
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;

        const order = await tx.order.findFirst({
          where: { id: orderId, restaurantId },
          include: { branch: true, items: true },
        });

        if (!order) {
          throw HttpError.notFound('That order does not exist.');
        }

        const legal = ALLOWED_TRANSITIONS[order.status];

        if (!legal.includes(toStatus)) {
          throw HttpError.validation({
            status: [
              legal.length > 0
                ? `An order that is ${order.status} can only move to: ${legal.join(', ')}.`
                : `An order that is ${order.status} cannot change status.`,
            ],
          });
        }

        if ((toStatus === 'cancelled' || toStatus === 'voided') && !options.reason) {
          throw HttpError.validation({
            reason: ['A reason is required when cancelling or voiding an order.'],
          });
        }

        const now = new Date();

        const timestamps: Partial<Record<string, Date>> = {};
        if (toStatus === 'confirmed') {
          timestamps.confirmedAt = now;
          // A rough countdown for the QR customer - branch.estimatedPrepMinutes
          // from the moment the kitchen actually accepted the order, not from
          // when it was placed and still waiting to be confirmed.
          timestamps.estimatedReadyAt = new Date(
            now.getTime() + order.branch.estimatedPrepMinutes * 60_000,
          );
        }
        if (toStatus === 'ready') timestamps.readyAt = now;
        if (toStatus === 'completed') timestamps.completedAt = now;

        const updated = await tx.order.update({
          where: { id: order.id },
          data: {
            status: toStatus,
            ...timestamps,
            cancelReason:
              toStatus === 'cancelled' || toStatus === 'voided' ? options.reason ?? null : null,
            statusHistory: {
              create: {
                fromStatus: order.status,
                toStatus,
                reason: options.reason ?? null,
                changedBy: options.actorId ?? null,
              },
            },
          },
          include: orderInclude,
        });

        // ------------------------------------------------------ side effects
        if (toStatus === 'confirmed') {
          await kitchenService.createTicketsForOrder(tx, updated);
          await inventoryService.commitForOrder(tx, updated, options.actorId);
        }

        if (toStatus === 'cancelled' || toStatus === 'voided') {
          await tx.kitchenTicket.updateMany({
            where: { orderId: order.id, status: { in: ['queued', 'preparing'] } },
            data: { status: 'cancelled' },
          });

          // Only reverse stock that was actually taken. An order cancelled while
          // still pending never reached the kitchen and never moved any.
          if (order.status !== 'pending') {
            await inventoryService.reverseForOrder(tx, updated, options.actorId);
          }
        }

        if (['completed', 'cancelled', 'voided'].includes(toStatus) && order.diningTableId) {
          await tx.diningTable.updateMany({
            where: { id: order.diningTableId, restaurantId },
            data: { status: 'available' },
          });
        }

        return updated;
      },
      { timeout: 15_000 },
    );
  },

  /**
   * Adds items to an order that has already been placed - a QR customer
   * ordering dessert after the mains, without the counter having to open a
   * second, separate bill for the same table.
   *
   * Gated on the same thing that matters to the customer: whether the bill
   * exists yet. Once an Invoice row exists for this order, its totals have
   * already been copied out and possibly printed or paid against, so nothing
   * can be added to it any more - a new order is the only way from there.
   */
  async appendItems(
    restaurantId: number,
    lookup: { orderNumber: string; diningTableId: number },
    items: OrderItemInput[],
  ) {
    if (items.length === 0) {
      throw HttpError.validation({ items: ['Add at least one item.'] });
    }

    return prisma.$transaction(
      async (tx) => {
        const existing = await tx.order.findFirst({
          where: {
            orderNumber: lookup.orderNumber,
            restaurantId,
            diningTableId: lookup.diningTableId,
          },
          select: { id: true },
        });

        if (!existing) {
          throw HttpError.notFound('That order does not exist.');
        }

        // Same lock-then-reread pattern as transition(): two "add items" taps
        // racing on the same order must not both read the same starting
        // totals and both add their lines on top of what's already stale.
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${existing.id} FOR UPDATE`;

        const order = await tx.order.findFirstOrThrow({
          where: { id: existing.id },
          include: { branch: true, items: true, invoice: { select: { id: true } } },
        });

        if (order.invoice) {
          throw HttpError.conflict(
            'The bill for this order has already been issued. Ask the counter to add these as a new order.',
          );
        }

        if (!APPENDABLE_STATUSES.includes(order.status)) {
          throw HttpError.conflict('This order is closed and cannot be added to.');
        }

        const newLines = await buildOrderLines(tx, restaurantId, order.branchId, items);

        const subtotal = money.sum([
          ...order.items.map((item) => item.lineTotal),
          ...newLines.map((line) => line.lineTotal),
        ]);

        const totals = calculateOrderTotals({
          subtotal,
          discountAmount: order.discountAmount,
          serviceChargePercentage: Number(order.branch.serviceChargePercentage),
          taxPercentage: Number(order.branch.taxPercentage),
        });

        const originalItemIds = new Set(order.items.map((item) => item.id));

        const updated = await tx.order.update({
          where: { id: order.id },
          data: {
            subtotal: totals.subtotal,
            serviceCharge: totals.serviceCharge,
            taxAmount: totals.taxAmount,
            grandTotal: totals.grandTotal,
            items: { create: newLines },
          },
          include: orderInclude,
        });

        const addedItems = updated.items.filter((item) => !originalItemIds.has(item.id));

        // The kitchen only exists for an order once it has been confirmed. If
        // this order is still pending, these lines will go out with the rest
        // of it when the counter confirms - no separate ticket needed yet. If
        // the kitchen is already working the table, these lines need their
        // own ticket: a second round, not a reprint of the first.
        if (order.status !== 'pending') {
          await kitchenService.createTicketsForOrder(tx, { ...updated, items: addedItems });
          await inventoryService.commitForOrder(tx, { ...updated, items: addedItems });
        }

        return updated;
      },
      { timeout: 15_000 },
    );
  },
};

export const orderInclude = {
  items: true,
  branch: { select: { id: true, name: true, code: true } },
  diningTable: { select: { id: true, label: true } },
  customer: { select: { id: true, fullName: true, phone: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true, grandTotal: true } },
  preferredPaymentMethod: { select: { id: true, name: true, kind: true } },
} satisfies Prisma.OrderInclude;

import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { HttpError } from '../utils/apiResponse';
import { money } from '../utils/money';
import { documentNumber } from '../utils/documentNumber';
import { commissionService } from './commissionService';

/**
 * Invoices, payments and refunds.
 *
 * The governing rule: nothing financial is ever updated or deleted to fix a
 * mistake. A wrong charge gets a refund row, a wrong invoice gets voided, and
 * commission on a refunded bill gets a negative entry. Nothing is overwritten,
 * so the history always reconciles and every figure traces back to the document
 * that produced it.
 */
type Tx = Prisma.TransactionClient;

type OrderForInvoice = {
  id: number;
  branchId: number;
  status: string;
  subtotal: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  serviceCharge: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  branch: { code: string };
};

/**
 * Creates the invoice row for an order that has none yet. Shared by
 * issueInvoice (an explicit "print the bill" action) and payOrder (a POS
 * one-tap settle that issues the bill implicitly if it hasn't been already) -
 * both must apply the same "food must be ready" gate and totals-copy rule.
 */
async function createInvoiceForOrder(tx: Tx, restaurantId: number, order: OrderForInvoice) {
  if (!['ready', 'served', 'completed'].includes(order.status)) {
    throw HttpError.conflict('A bill can only be issued once the food has been prepared.');
  }

  const invoiceNumber = await documentNumber.forInvoice(tx, order.branchId, order.branch.code);

  return tx.invoice.create({
    data: {
      restaurantId,
      branchId: order.branchId,
      orderId: order.id,
      invoiceNumber,
      status: 'issued',
      subtotal: order.subtotal,
      discountAmount: order.discountAmount,
      serviceCharge: order.serviceCharge,
      taxAmount: order.taxAmount,
      grandTotal: order.grandTotal,
      // What a bill QR encodes. A customer scans it to see the bill and
      // pay; it carries no account details of its own.
      qrPayload: `invoice:${invoiceNumber}`,
    },
  });
}

export const billingService = {
  /** Issues the bill. Totals are copied from the order, not recalculated. */
  async issueInvoice(restaurantId: number, orderId: number) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, restaurantId },
        include: { branch: true, invoice: true },
      });

      if (!order) {
        throw HttpError.notFound('That order does not exist.');
      }

      if (order.invoice) {
        return tx.invoice.findUniqueOrThrow({
          where: { id: order.invoice.id },
          include: invoiceInclude,
        });
      }

      const invoice = await createInvoiceForOrder(tx, restaurantId, order);

      return tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: invoiceInclude });
    });
  },

  /**
   * One-tap POS settle: issues the bill if it hasn't been already, then takes
   * full payment for whatever is still outstanding.
   *
   * Idempotent on idempotencyKey - a retried tap (a flaky connection, a
   * cashier double-pressing) replays the original payment instead of erroring
   * or, worse, taking the money twice.
   */
  async payOrder(
    restaurantId: number,
    orderId: number,
    input: { idempotencyKey?: string; paymentMethodId?: number; actorId?: number },
  ) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, restaurantId },
        include: { branch: true, invoice: true },
      });

      if (!order) {
        throw HttpError.notFound('That order does not exist.');
      }

      if (order.invoice && input.idempotencyKey) {
        const existingPayment = await tx.payment.findFirst({
          where: { invoiceId: order.invoice.id, idempotencyKey: input.idempotencyKey },
        });

        if (existingPayment) {
          const currentInvoice = await tx.invoice.findUniqueOrThrow({
            where: { id: order.invoice.id },
            include: invoiceInclude,
          });
          return { payment: existingPayment, invoice: currentInvoice };
        }
      }

      if (order.paymentStatus === 'paid') {
        throw HttpError.conflict('This order is already marked paid.');
      }

      const invoice = order.invoice ?? (await createInvoiceForOrder(tx, restaurantId, order));

      if (invoice.status === 'void') {
        throw HttpError.conflict('That invoice has been voided.');
      }

      const method = input.paymentMethodId
        ? await tx.paymentMethod.findFirst({
            where: { id: input.paymentMethodId, restaurantId, isActive: true },
          })
        : await tx.paymentMethod.findFirst({
            where: { restaurantId, kind: 'cash', isActive: true },
            orderBy: { sortOrder: 'asc' },
          });

      if (!method) {
        throw HttpError.validation({
          paymentMethodId: ['Pass a payment method - no active cash method is configured.'],
        });
      }

      const outstanding = money.round(
        money.from(invoice.grandTotal).sub(money.from(invoice.paidAmount)),
      );

      if (outstanding.lte(0)) {
        throw HttpError.conflict('This order is already marked paid.');
      }

      const payment = await tx.payment.create({
        data: {
          restaurantId,
          invoiceId: invoice.id,
          paymentMethodId: method.id,
          amount: outstanding,
          changeAmount: money.zero(),
          receivedBy: input.actorId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });

      const paidAmount = money.round(money.from(invoice.paidAmount).add(outstanding));

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidAmount, status: 'paid', paidAt: new Date() },
        include: invoiceInclude,
      });

      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'paid' },
      });

      // Commission accrues only on a fully-paid bill, per commissionService's
      // rule - never on an order that is still owed money.
      await commissionService.accrueForInvoice(tx, updatedInvoice, updatedInvoice.order.businessDate);

      return { payment, invoice: updatedInvoice };
    }, { timeout: 15_000 });
  },

  /**
   * The printable receipt for an order. Reads the order's own frozen
   * snapshots (subtotal, service charge percent + amount, table, token,
   * order taker) rather than recomputing anything - a reprint must always
   * show exactly what the original said.
   */
  async getReceipt(restaurantId: number, orderId: number) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        branch: { select: { name: true } },
        diningTable: { select: { label: true } },
        items: true,
        invoice: {
          include: { payments: { include: { method: { select: { name: true, kind: true } } } } },
        },
      },
    });

    if (!order) {
      throw HttpError.notFound('That order does not exist.');
    }

    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { name: true, addressLine: true, city: true, contactPhone: true },
    });

    const status = order.invoice?.status === 'void'
      ? 'VOID'
      : order.paymentStatus === 'paid'
        ? 'PAID'
        : 'UNPAID';

    return {
      restaurant: {
        name: restaurant.name,
        address: [restaurant.addressLine, restaurant.city].filter(Boolean).join(', ') || null,
        phone: restaurant.contactPhone,
      },
      status,
      tokenNumber: order.tokenNumber,
      tableNumber: order.tableNumber ?? order.diningTable?.label ?? null,
      orderId: order.id,
      date: order.placedAt,
      invoiceNumber: order.invoice?.invoiceNumber ?? null,
      orderType: order.orderType,
      branchName: order.branch.name,
      items: order.items.map((item) => ({
        name: item.variantName ? `${item.productName} (${item.variantName})` : item.productName,
        quantity: item.quantity,
        rate: Number(item.unitPrice),
        total: Number(item.lineTotal),
      })),
      subtotal: Number(order.subtotal),
      serviceChargePercent: Number(order.serviceChargePercent),
      serviceCharge: Number(order.serviceCharge),
      taxAmount: Number(order.taxAmount),
      grandTotal: Number(order.grandTotal),
      covers: order.guestCount,
      orderTaker: order.orderTakerName,
      printedAt: new Date(),
      complaintsContact: restaurant.contactPhone,
      footer: 'Software By Digitalkeez',
    };
  },

  /**
   * Records money received.
   *
   * Overpayment is rejected rather than quietly accepted - a till that accepts
   * more than the bill produces a figure nobody can reconcile at close.
   */
  async recordPayment(
    restaurantId: number,
    invoiceId: number,
    input: {
      paymentMethodId: number;
      amount: number | Prisma.Decimal;
      tenderedAmount?: number | Prisma.Decimal;
      reference?: string;
      receivedBy?: number;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, restaurantId },
        include: { payments: true },
      });

      if (!invoice) {
        throw HttpError.notFound('That invoice does not exist.');
      }

      if (invoice.status === 'void') {
        throw HttpError.conflict('That invoice has been voided.');
      }

      const method = await tx.paymentMethod.findFirst({
        where: { id: input.paymentMethodId, restaurantId, isActive: true },
      });

      if (!method) {
        throw HttpError.validation({
          paymentMethodId: ['That payment method is not available.'],
        });
      }

      if (method.requiresReference && !input.reference?.trim()) {
        throw HttpError.validation({
          reference: [`${method.name} needs a transaction reference.`],
        });
      }

      const amount = money.round(money.from(input.amount));

      if (amount.lte(0)) {
        throw HttpError.validation({ amount: ['Amount must be more than zero.'] });
      }

      const outstanding = money.round(
        money.from(invoice.grandTotal).sub(money.from(invoice.paidAmount)),
      );

      if (amount.gt(outstanding)) {
        throw HttpError.validation({
          amount: [`That is more than the ${outstanding.toString()} still owed.`],
        });
      }

      const tendered = input.tenderedAmount ? money.from(input.tenderedAmount) : null;
      const change = tendered && tendered.gt(amount) ? money.round(tendered.sub(amount)) : money.zero();

      const payment = await tx.payment.create({
        data: {
          restaurantId,
          invoiceId: invoice.id,
          paymentMethodId: method.id,
          amount,
          tenderedAmount: tendered,
          changeAmount: change,
          reference: input.reference?.trim() || null,
          receivedBy: input.receivedBy ?? null,
        },
      });

      const paidAmount = money.round(money.from(invoice.paidAmount).add(amount));
      const isFullyPaid = paidAmount.gte(money.from(invoice.grandTotal));

      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paidAmount,
          status: isFullyPaid ? 'paid' : invoice.status,
          paidAt: isFullyPaid ? new Date() : invoice.paidAt,
        },
        include: invoiceInclude,
      });

      await tx.order.update({
        where: { id: invoice.orderId },
        data: { paymentStatus: isFullyPaid ? 'paid' : 'partial' },
      });

      // Commission accrues only on a fully-paid bill. An order that is
      // cancelled or never paid must never generate platform revenue.
      if (isFullyPaid) {
        await commissionService.accrueForInvoice(tx, updated, updated.order.businessDate);
      }

      return { payment, invoice: updated };
    });
  },

  /**
   * Returns money. The original payment is left exactly as it was; this is a
   * separate, compensating record.
   */
  async issueRefund(
    restaurantId: number,
    invoiceId: number,
    input: {
      amount: number | Prisma.Decimal;
      reasonCode: string;
      reasonNote?: string;
      restockedInventory?: boolean;
      issuedBy?: number;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, restaurantId },
      });

      if (!invoice) {
        throw HttpError.notFound('That invoice does not exist.');
      }

      const amount = money.round(money.from(input.amount));

      const refundable = money.round(
        money.from(invoice.paidAmount).sub(money.from(invoice.refundedAmount)),
      );

      if (amount.lte(0)) {
        throw HttpError.validation({ amount: ['Amount must be more than zero.'] });
      }

      if (amount.gt(refundable)) {
        throw HttpError.validation({
          amount: [`Only ${refundable.toString()} can still be refunded on this bill.`],
        });
      }

      const refund = await tx.refund.create({
        data: {
          restaurantId,
          invoiceId: invoice.id,
          amount,
          reasonCode: input.reasonCode,
          reasonNote: input.reasonNote?.slice(0, 255) ?? null,
          restockedInventory: input.restockedInventory ?? false,
          issuedBy: input.issuedBy ?? null,
        },
      });

      const refundedAmount = money.round(money.from(invoice.refundedAmount).add(amount));
      const isFullyRefunded = refundedAmount.gte(money.from(invoice.paidAmount));

      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          refundedAmount,
          status: isFullyRefunded ? 'refunded' : 'partially_refunded',
        },
        include: invoiceInclude,
      });

      // The platform gives back its share of what was returned.
      await commissionService.reverseForRefund(tx, updated, amount);

      return { refund, invoice: updated };
    });
  },

  /** Voids a bill. The row stays; only its status changes. */
  async voidInvoice(restaurantId: number, invoiceId: number, reason: string) {
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, restaurantId } });

    if (!invoice) {
      throw HttpError.notFound('That invoice does not exist.');
    }

    if (money.from(invoice.paidAmount).gt(0)) {
      throw HttpError.conflict(
        'This bill has money against it. Refund it rather than voiding it.',
      );
    }

    return prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'void', voidedAt: new Date(), voidReason: reason },
      include: invoiceInclude,
    });
  },
};

export const invoiceInclude = {
  payments: { include: { method: { select: { id: true, name: true, kind: true } } } },
  refunds: true,
  order: { select: { id: true, orderNumber: true, orderType: true, businessDate: true } },
} satisfies Prisma.InvoiceInclude;

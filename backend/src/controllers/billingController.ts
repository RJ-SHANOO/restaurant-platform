import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse } from '../utils/apiResponse';
import { billingService } from '../services/billingService';
import { auditLogService } from '../services/auditLogService';

const paymentSchema = z.object({
  paymentMethodId: z.number().int().positive(),
  amount: z.number().positive(),
  tenderedAmount: z.number().positive().optional(),
  reference: z.string().max(120).optional(),
  idempotencyKey: z.string().max(64).optional(),
});

const paySchema = z.object({
  idempotencyKey: z.string().max(64).optional(),
  paymentMethodId: z.number().int().positive().optional(),
});

const refundSchema = z.object({
  amount: z.number().positive(),
  reasonCode: z.enum([
    'customer_complaint', 'wrong_order', 'quality_issue',
    'overcharge', 'duplicate_payment', 'other',
  ]),
  reasonNote: z.string().max(255).optional(),
  restockedInventory: z.boolean().optional(),
  idempotencyKey: z.string().max(64).optional(),
});

export const billingController = {
  async issueInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const invoice = await billingService.issueInvoice(
        req.tenantId!,
        Number(req.params.orderId),
      );

      return apiResponse.created(res, serialiseInvoice(invoice), `Bill ${invoice.invoiceNumber} issued.`);
    } catch (error) {
      next(error);
    }
  },

  async recordPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const input = paymentSchema.parse(req.body);

      const { invoice } = await billingService.recordPayment(
        req.tenantId!,
        Number(req.params.invoiceId),
        { ...input, receivedBy: req.actor!.id },
      );

      return apiResponse.created(
        res,
        serialiseInvoice(invoice),
        invoice.status === 'paid' ? 'Bill settled in full.' : 'Payment recorded.',
      );
    } catch (error) {
      next(error);
    }
  },

  async pay(req: Request, res: Response, next: NextFunction) {
    try {
      const input = paySchema.parse(req.body);

      const { invoice } = await billingService.payOrder(
        req.tenantId!,
        Number(req.params.orderId),
        { ...input, actorId: req.actor!.id },
      );

      return apiResponse.created(res, serialiseInvoice(invoice), 'Order marked paid.');
    } catch (error) {
      next(error);
    }
  },

  async receipt(req: Request, res: Response, next: NextFunction) {
    try {
      const receipt = await billingService.getReceipt(req.tenantId!, Number(req.params.orderId));
      return apiResponse.success(res, receipt);
    } catch (error) {
      next(error);
    }
  },

  async issueRefund(req: Request, res: Response, next: NextFunction) {
    try {
      const input = refundSchema.parse(req.body);

      const { refund, invoice } = await billingService.issueRefund(
        req.tenantId!,
        Number(req.params.invoiceId),
        { ...input, issuedBy: req.actor!.id },
      );

      // Giving money back is sensitive enough to want its own entry in the
      // cross-entity log, on top of the Refund row itself.
      await auditLogService.record({
        actorId: req.actor!.id,
        restaurantId: req.tenantId!,
        action: 'invoice.refunded',
        subjectType: 'Invoice',
        subjectId: invoice.id,
        newValues: {
          refundId: refund.id,
          amount: Number(refund.amount),
          reasonCode: refund.reasonCode,
        },
      });

      return apiResponse.created(res, serialiseInvoice(invoice), 'Refund recorded.');
    } catch (error) {
      next(error);
    }
  },

  async show(req: Request, res: Response, next: NextFunction) {
    try {
      const invoice = await req.db!.invoice.findFirst({
        where: { id: Number(req.params.invoiceId) },
        include: {
          payments: { include: { method: { select: { id: true, name: true, kind: true } } } },
          refunds: true,
          order: { select: { id: true, orderNumber: true, orderType: true } },
        },
      });

      if (!invoice) {
        return apiResponse.error(res, 404, 'That invoice does not exist.');
      }

      return apiResponse.success(res, serialiseInvoice(invoice));
    } catch (error) {
      next(error);
    }
  },
};

function serialiseInvoice(invoice: Record<string, any>) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    order: invoice.order,
    totals: {
      subtotal: Number(invoice.subtotal),
      discountAmount: Number(invoice.discountAmount),
      serviceCharge: Number(invoice.serviceCharge),
      taxAmount: Number(invoice.taxAmount),
      grandTotal: Number(invoice.grandTotal),
      paidAmount: Number(invoice.paidAmount),
      refundedAmount: Number(invoice.refundedAmount),
      outstanding: Number(invoice.grandTotal) - Number(invoice.paidAmount),
    },
    qrPayload: invoice.qrPayload,
    payments: invoice.payments?.map((payment: Record<string, any>) => ({
      id: payment.id,
      method: payment.method,
      amount: Number(payment.amount),
      changeAmount: Number(payment.changeAmount),
      reference: payment.reference,
      state: payment.state,
      createdAt: payment.createdAt,
    })),
    refunds: invoice.refunds?.map((refund: Record<string, any>) => ({
      id: refund.id,
      amount: Number(refund.amount),
      reasonCode: refund.reasonCode,
      reasonNote: refund.reasonNote,
      createdAt: refund.createdAt,
    })),
    issuedAt: invoice.issuedAt,
    paidAt: invoice.paidAt,
  };
}

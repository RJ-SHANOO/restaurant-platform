import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse, HttpError } from '../utils/apiResponse';
import { kitchenService } from '../services/kitchenService';

/**
 * The pass.
 *
 * Nothing this controller returns contains a price. The models it reads have
 * no money columns, so that is structural rather than a matter of remembering
 * to leave fields out.
 */

const statusSchema = z.object({
  status: z.enum(['queued', 'preparing', 'ready', 'served', 'cancelled']),
});

export const kitchenController = {
  async board(req: Request, res: Response, next: NextFunction) {
    try {
      const { stationId } = req.query;

      const tickets = await req.db!.kitchenTicket.findMany({
        where: {
          status: { in: ['queued', 'preparing'] },
          ...(req.actor!.branchId ? { branchId: req.actor!.branchId } : {}),
          ...(typeof stationId === 'string' ? { kitchenStationId: Number(stationId) } : {}),
        },
        include: {
          items: true,
          station: { select: { id: true, name: true } },
        },
        // Rush first, then oldest. A chef should never have to sort the rail.
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: 60,
      });

      return apiResponse.success(res, tickets.map(serialiseTicket));
    } catch (error) {
      next(error);
    }
  },

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = statusSchema.parse(req.body);
      const id = Number(req.params.id);

      const ticket = await req.db!.kitchenTicket.findFirst({ where: { id } });

      if (!ticket) {
        throw HttpError.notFound('That ticket does not exist.');
      }

      const now = new Date();

      const updated = await req.db!.kitchenTicket.update({
        where: { id },
        data: {
          status,
          ...(status === 'preparing' && !ticket.startedAt ? { startedAt: now } : {}),
          ...(status === 'ready' ? { readyAt: now } : {}),
        },
        include: { items: true, station: { select: { id: true, name: true } } },
      });

      return apiResponse.success(res, serialiseTicket(updated), 'Ticket updated.');
    } catch (error) {
      next(error);
    }
  },

  async printPayload(req: Request, res: Response, next: NextFunction) {
    try {
      const ticket = await req.db!.kitchenTicket.findFirst({
        where: { id: Number(req.params.id) },
        include: {
          items: true,
          station: { select: { name: true, printerName: true } },
        },
      });

      if (!ticket) {
        throw HttpError.notFound('That ticket does not exist.');
      }

      await req.db!.kitchenTicket.update({
        where: { id: ticket.id },
        data: { printedAt: new Date() },
      });

      return apiResponse.success(res, kitchenService.buildPrintPayload(ticket));
    } catch (error) {
      next(error);
    }
  },
};

function serialiseTicket(ticket: Record<string, any>) {
  const urgency = kitchenService.urgencyOf(ticket as never);

  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    orderId: ticket.orderId,
    station: ticket.station,
    status: ticket.status,
    priority: ticket.priority,
    tableLabel: ticket.tableLabel,
    orderTypeLabel: ticket.orderTypeLabel,
    note: ticket.note,
    targetMinutes: ticket.targetMinutes,
    urgency,
    items: ticket.items?.map((item: Record<string, any>) => ({
      id: item.id,
      productName: item.productName,
      variantName: item.variantName,
      quantity: item.quantity,
      note: item.note,
      isDone: item.isDone,
    })),
    createdAt: ticket.createdAt,
    startedAt: ticket.startedAt,
    readyAt: ticket.readyAt,
  };
}

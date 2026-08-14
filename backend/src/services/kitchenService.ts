import type { Prisma } from '@prisma/client';
import { documentNumber } from '../utils/documentNumber';

type Tx = Prisma.TransactionClient;

/**
 * Kitchen tickets.
 *
 * Nothing in this file touches money, and the models it writes have no money
 * columns. A price cannot leak onto the pass through a template change,
 * because there is no price to leak.
 */
export const kitchenService = {
  /**
   * Splits a confirmed order into one ticket per kitchen station.
   *
   * Routing is by category: the grill gets the burgers, the bar gets the
   * drinks. A category with no station mapping falls into a single default
   * ticket, so a restaurant that has not configured stations still works on
   * its first day.
   */
  async createTicketsForOrder(
    tx: Tx,
    order: { id: number; restaurantId: number; branchId: number; orderType: string;
             diningTableId: number | null; customerNote: string | null;
             items: { id: number; productId: number; productName: string;
                      variantName: string | null; quantity: number;
                      kitchenNote: string | null }[] },
  ) {
    const branch = await tx.branch.findUniqueOrThrow({
      where: { id: order.branchId },
      select: { code: true },
    });

    const table = order.diningTableId
      ? await tx.diningTable.findUnique({
          where: { id: order.diningTableId },
          select: { label: true },
        })
      : null;

    const products = await tx.product.findMany({
      where: { id: { in: order.items.map((item) => item.productId) } },
      select: {
        id: true,
        preparationMinutes: true,
        category: { select: { stations: { select: { kitchenStationId: true } } } },
      },
    });

    const routing = new Map(
      products.map((product) => [
        product.id,
        product.category.stations[0]?.kitchenStationId ?? null,
      ]),
    );

    const prepMinutes = new Map(
      products.map((product) => [product.id, product.preparationMinutes]),
    );

    // Group the lines by the station that will cook them.
    const byStation = new Map<number | null, typeof order.items>();

    for (const item of order.items) {
      const stationId = routing.get(item.productId) ?? null;
      byStation.set(stationId, [...(byStation.get(stationId) ?? []), item]);
    }

    const created = [];

    for (const [stationId, items] of byStation) {
      const ticketNumber = await documentNumber.forTicket(tx, order.branchId, branch.code);

      // The ticket's clock is set by its slowest dish - a ticket is not ready
      // until everything on it is.
      const targetMinutes = Math.max(
        ...items.map((item) => prepMinutes.get(item.productId) ?? 10),
      );

      created.push(
        await tx.kitchenTicket.create({
          data: {
            restaurantId: order.restaurantId,
            branchId: order.branchId,
            orderId: order.id,
            kitchenStationId: stationId,
            ticketNumber,
            status: 'queued',
            priority: 'normal',
            tableLabel: table?.label ?? null,
            orderTypeLabel: order.orderType,
            note: order.customerNote,
            targetMinutes,
            items: {
              create: items.map((item) => ({
                orderItemId: item.id,
                productName: item.productName,
                variantName: item.variantName,
                quantity: item.quantity,
                note: item.kitchenNote,
              })),
            },
          },
        }),
      );
    }

    return created;
  },

  /**
   * What the desktop bridge sends to a thermal printer.
   *
   * Deliberately assembled by hand rather than serialised from the model, so
   * the absence of prices is a property of this function and visible in one
   * screen of code.
   */
  buildPrintPayload(ticket: {
    ticketNumber: string;
    tableLabel: string | null;
    orderTypeLabel: string | null;
    note: string | null;
    createdAt: Date;
    station: { name: string; printerName: string | null } | null;
    items: { productName: string; variantName: string | null; quantity: number; note: string | null }[];
  }) {
    return {
      ticketNumber: ticket.ticketNumber,
      station: ticket.station?.name ?? 'Kitchen',
      printerName: ticket.station?.printerName ?? null,
      table: ticket.tableLabel,
      orderType: ticket.orderTypeLabel,
      printedAt: new Date().toISOString(),
      placedAt: ticket.createdAt.toISOString(),
      note: ticket.note,
      lines: ticket.items.map((item) => ({
        quantity: item.quantity,
        name: item.variantName ? `${item.productName} (${item.variantName})` : item.productName,
        note: item.note,
      })),
    };
  },

  /**
   * How late a ticket is running, as a band rather than a raw number, so the
   * display and the printer agree on what counts as urgent.
   */
  urgencyOf(ticket: { createdAt: Date; targetMinutes: number; readyAt: Date | null }) {
    const endedAt = ticket.readyAt ?? new Date();
    const elapsedMinutes = (endedAt.getTime() - ticket.createdAt.getTime()) / 60_000;
    const ratio = elapsedMinutes / Math.max(ticket.targetMinutes, 1);

    return {
      elapsedMinutes: Math.floor(elapsedMinutes),
      ratio: Math.min(ratio, 2),
      level: ratio >= 1 ? 'overdue' : ratio >= 0.7 ? 'warning' : 'on_time',
    } as const;
  },
};

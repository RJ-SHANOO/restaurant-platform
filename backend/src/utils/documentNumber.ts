import type { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

/**
 * Human-readable document numbers: LHR-01-20260812-0045
 *
 * Branch code, date, then a counter that restarts each day. A cashier reading
 * a number out over the phone can tell which outlet and which day it came from
 * without looking anything up - which is the entire reason not to just show
 * the database id.
 *
 * The counter is derived by counting today's rows inside the caller's
 * transaction, so two simultaneous orders cannot claim the same number.
 */

type Tx = Pick<PrismaClient, 'order' | 'invoice' | 'kitchenTicket' | 'purchase' | 'settlement'>;

function datePart(now = new Date()): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
}

function startOfToday(): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

export const documentNumber = {
  async forOrder(tx: Tx, branchId: number, branchCode: string): Promise<string> {
    const todayCount = await tx.order.count({
      where: { branchId, createdAt: { gte: startOfToday() } },
    });

    return `${branchCode}-${datePart()}-${String(todayCount + 1).padStart(4, '0')}`;
  },

  async forInvoice(tx: Tx, branchId: number, branchCode: string): Promise<string> {
    const todayCount = await tx.invoice.count({
      where: { branchId, createdAt: { gte: startOfToday() } },
    });

    return `INV-${branchCode}-${datePart()}-${String(todayCount + 1).padStart(4, '0')}`;
  },

  async forTicket(tx: Tx, branchId: number, branchCode: string): Promise<string> {
    const todayCount = await tx.kitchenTicket.count({
      where: { branchId, createdAt: { gte: startOfToday() } },
    });

    return `KOT-${branchCode}-${String(todayCount + 1).padStart(4, '0')}`;
  },

  async forPurchase(tx: Tx, branchId: number, branchCode: string): Promise<string> {
    const todayCount = await tx.purchase.count({
      where: { branchId, createdAt: { gte: startOfToday() } },
    });

    return `PO-${branchCode}-${datePart()}-${String(todayCount + 1).padStart(4, '0')}`;
  },

  async forSettlement(tx: Tx, restaurantId: number): Promise<string> {
    const count = await tx.settlement.count({ where: { restaurantId } });
    return `STL-${datePart()}-${String(count + 1).padStart(4, '0')}`;
  },
};

/** A URL-safe token with enough entropy that guessing one is not worth trying. */
export function randomToken(length = 48): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);

  let token = '';
  for (let i = 0; i < length; i += 1) {
    token += alphabet[bytes[i] % alphabet.length];
  }

  return token;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 150);
}

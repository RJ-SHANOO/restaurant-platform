import { Prisma } from '@prisma/client';
import { money, type Money } from '../utils/money';

/**
 * Resolves what a branch's Mezbaan settings say tax and service charge
 * should be, for one checkout.
 *
 * Used from inside a transaction at two different moments:
 *   - orderService, when an order is placed - an ESTIMATE, using whatever
 *     payment method the customer already stated an intent for (if any).
 *   - billingService.createInvoiceForOrder, when the bill is actually issued
 *     - the BINDING number, using the method that is actually being paid
 *     with. This is "resolved at payment time": nothing here ever reads a
 *     client-sent total.
 *
 * Settings changes never reach back into an order or invoice already
 * written - each one keeps whatever this function returned for it at the
 * time, on its own row.
 */
type Tx = Prisma.TransactionClient;

export interface ResolvedCharges {
  taxMode: 'disabled' | 'uniform' | 'per_method' | 'fixed';
  taxRate: Money;
  serviceChargeRate: Money;
  subtotal: Money;
  discountAmount: Money;
  serviceChargeAmount: Money;
  taxAmount: Money;
  /** subtotal - discount + serviceChargeAmount + taxAmount. Caller adds delivery/tip on top. */
  total: Money;
  paymentMethodId: number | null;
  paymentMethodName: string | null;
}

/**
 * Creates a default row the first time anyone checks out for a branch that
 * has never opened Mezbaan. businessName has to come from somewhere, so it
 * starts as the branch's own name.
 */
export async function getOrCreateBranchSettings(tx: Tx, restaurantId: number, branchId: number) {
  const existing = await tx.branchSettings.findFirst({ where: { branchId, restaurantId } });
  if (existing) {
    return existing;
  }

  const branch = await tx.branch.findFirstOrThrow({
    where: { id: branchId, restaurantId },
    select: { name: true },
  });

  return tx.branchSettings.create({
    data: { restaurantId, branchId, businessName: branch.name },
  });
}

export async function resolveCharges(
  tx: Tx,
  restaurantId: number,
  branchId: number,
  input: { subtotal: Money; discountAmount?: Money; paymentMethodId?: number | null },
): Promise<ResolvedCharges> {
  const settings = await getOrCreateBranchSettings(tx, restaurantId, branchId);

  const subtotal = money.round(input.subtotal);
  const discountAmount = money.round(input.discountAmount ?? money.zero());
  const taxableBase = subtotal.sub(discountAmount);

  const serviceChargeRate = settings.serviceChargeEnabled ? settings.serviceChargeRate : money.zero();
  const serviceChargeAmount = money.percentageOf(taxableBase, serviceChargeRate);

  const method = input.paymentMethodId
    ? await tx.paymentMethod.findFirst({
        where: { id: input.paymentMethodId, branchId, deletedAt: null },
        select: { id: true, name: true, taxRate: true },
      })
    : null;

  let taxRate = money.zero();
  let taxAmount = money.zero();

  switch (settings.taxMode) {
    case 'uniform':
      taxRate = settings.uniformRate;
      taxAmount = money.percentageOf(taxableBase.add(serviceChargeAmount), taxRate);
      break;
    case 'per_method':
      // No method known yet (e.g. a printed bill before the tender is
      // chosen) resolves to no tax rather than guessing one - the binding
      // number is only trustworthy once a method is actually on the table.
      taxRate = method ? method.taxRate : money.zero();
      taxAmount = money.percentageOf(taxableBase.add(serviceChargeAmount), taxRate);
      break;
    case 'fixed':
      taxAmount = money.round(settings.fixedAmount);
      break;
    case 'disabled':
    default:
      break;
  }

  const total = money.round(taxableBase.add(serviceChargeAmount).add(taxAmount));

  return {
    taxMode: settings.taxMode,
    taxRate: money.round(taxRate),
    serviceChargeRate: money.round(serviceChargeRate),
    subtotal,
    discountAmount,
    serviceChargeAmount,
    taxAmount,
    total,
    paymentMethodId: method?.id ?? null,
    paymentMethodName: method?.name ?? null,
  };
}

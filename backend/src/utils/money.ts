import { Prisma } from '@prisma/client';

/**
 * All money arithmetic, in one place.
 *
 * Prisma.Decimal rather than number throughout: 0.1 + 0.2 is not 0.3 in binary
 * floating point, and a drift of a fraction of a rupee per line becomes a bill
 * that does not add up to what the card machine charged.
 */

const Decimal = Prisma.Decimal;
export type Money = Prisma.Decimal;

export const money = {
  from(value: number | string | Money): Money {
    return new Decimal(value);
  },

  zero(): Money {
    return new Decimal(0);
  },

  /** Rounds to 2 decimal places, half away from zero - the way a till rounds. */
  round(value: Money): Money {
    return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  },

  percentageOf(base: Money, percentage: number | Money): Money {
    return this.round(base.mul(new Decimal(percentage)).div(100));
  },

  sum(values: Money[]): Money {
    return values.reduce((total, value) => total.add(value), new Decimal(0));
  },
};

export interface OrderTotalsInput {
  subtotal: Money;
  discountAmount?: Money;
  serviceChargePercentage: number | Money;
  taxPercentage: number | Money;
  deliveryFee?: Money;
  tipAmount?: Money;
}

export interface OrderTotals {
  subtotal: Money;
  discountAmount: Money;
  serviceCharge: Money;
  taxAmount: Money;
  deliveryFee: Money;
  tipAmount: Money;
  grandTotal: Money;
}

/**
 * The order of operations here is deliberate and is the part worth arguing
 * about:
 *
 *   subtotal - discount            = taxable base
 *   + service charge (% of base)
 *   + tax (% of base + service)
 *   + delivery + tip
 *   = grand total
 *
 * Tax applies to the service charge because that is how it is assessed in
 * Pakistan. Each component is rounded once, as it is computed, so the printed
 * lines always sum to the printed total - a receipt whose parts do not add up
 * to its own total is the fastest way to lose a customer's trust.
 */
export function calculateOrderTotals(input: OrderTotalsInput): OrderTotals {
  const subtotal = money.round(input.subtotal);
  const discountAmount = money.round(input.discountAmount ?? money.zero());

  const taxableBase = subtotal.sub(discountAmount);
  const serviceCharge = money.percentageOf(taxableBase, input.serviceChargePercentage);
  const taxAmount = money.percentageOf(taxableBase.add(serviceCharge), input.taxPercentage);

  const deliveryFee = money.round(input.deliveryFee ?? money.zero());
  const tipAmount = money.round(input.tipAmount ?? money.zero());

  const grandTotal = money.round(
    taxableBase.add(serviceCharge).add(taxAmount).add(deliveryFee).add(tipAmount),
  );

  return {
    subtotal,
    discountAmount,
    serviceCharge,
    taxAmount,
    deliveryFee,
    tipAmount,
    grandTotal,
  };
}

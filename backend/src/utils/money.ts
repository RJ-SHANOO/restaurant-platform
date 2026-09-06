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

// Order totals (subtotal, service charge, tax, grand total) are computed by
// settingsService.resolveCharges, not here - a branch's rate now comes from
// BranchSettings/PaymentMethod, not a flat percentage on Branch itself.

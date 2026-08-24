/**
 * The restaurant's calendar day, in its own timezone, as a Date holding
 * midnight UTC of that day - the shape Prisma expects for an @db.Date column.
 *
 * Built on Intl rather than a date library: Node has full IANA timezone data
 * built in, so no dependency is needed for this one conversion.
 */
export function businessDateFor(timezone: string, at: Date = new Date()): Date {
  const isoDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);

  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Whole days between two business dates (both midnight-UTC Dates). */
export function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

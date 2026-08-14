/**
 * Presentation helpers. Anything a user reads as a number, a time or a label
 * is formatted here so the same value never appears two different ways in two
 * different screens.
 */

const DEFAULT_CURRENCY = 'PKR';

export function formatMoney(amount: number, currency = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Compact form for dashboard tiles: 1.2M, 84.5K. */
export function formatCompactMoney(amount: number, currency = DEFAULT_CURRENCY): string {
  const symbol = currency === 'PKR' ? 'Rs' : currency;

  if (Math.abs(amount) >= 1_000_000) return `${symbol} ${(amount / 1_000_000).toFixed(1)}M`;
  if (Math.abs(amount) >= 1_000) return `${symbol} ${(amount / 1_000).toFixed(1)}K`;

  return `${symbol} ${amount.toFixed(0)}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-PK').format(value);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "4 min ago", "just now" - used on the live order board. */
export function formatRelative(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;

  return formatDate(iso);
}

export function humanise(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

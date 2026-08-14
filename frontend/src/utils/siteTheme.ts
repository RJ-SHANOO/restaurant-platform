/**
 * Turns a restaurant's theme columns into the handful of computed colours a
 * public-facing page needs. Shared by every page a guest can land on without
 * signing in - the public site and the QR ordering page - so a guest sees the
 * restaurant's own colours there too, not this app's fixed dark palette.
 *
 * Those pages apply colour as inline styles rather than Tailwind's bg-ember /
 * text-ink classes: those classes compile to fixed rgb values at build time,
 * so they cannot be swapped per tenant at runtime.
 */

const SHADE_BACKGROUND: Record<string, string> = {
  dark: '#0D1014',
  midnight: '#0A0F1E',
  slate: '#1A1F26',
  light: '#F7F8FA',
};

export interface ResolvedSiteTheme {
  background: string;
  text: string;
  muted: string;
  surface: string;
  border: string;
  onPrimary: string;
}

export function resolveSiteTheme(backgroundShade: string | undefined): ResolvedSiteTheme {
  const background = SHADE_BACKGROUND[backgroundShade ?? 'dark'] ?? SHADE_BACKGROUND.dark;
  const isLight = backgroundShade === 'light';

  return {
    background,
    text: isLight ? '#1A1F26' : '#E9EEF5',
    muted: isLight ? '#5F6B7A' : '#97A3B3',
    surface: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.04)',
    border: isLight ? '#E5E7EB' : '#262E3A',
    onPrimary: '#1A1206',
  };
}

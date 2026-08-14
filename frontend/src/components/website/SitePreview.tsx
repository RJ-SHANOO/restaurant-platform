import { Facebook, Globe, Instagram, Loader2, Phone } from 'lucide-react';
import type { WebsiteSettings } from './types';

const SHADE_SWATCH: Record<string, string> = {
  dark: '#0D1014',
  midnight: '#0A0F1E',
  slate: '#1A1F26',
  light: '#F7F8FA',
};

/**
 * A miniature of the public site, drawn from the live draft values.
 *
 * Not an iframe of the real page: at this size the real layout would be
 * unreadable, and an iframe would need the site published before it could show
 * anything. This shows the effect of a change immediately, before saving, and
 * updates the same way regardless of which tab is open.
 */
export function SitePreview({
  settings,
  restaurantName,
}: {
  settings: Partial<WebsiteSettings>;
  restaurantName: string;
}) {
  const background = SHADE_SWATCH[settings.backgroundShade ?? 'dark'] ?? '#0D1014';
  const isLight = settings.backgroundShade === 'light';
  const text = isLight ? '#1A1F26' : '#E9EEF5';
  const muted = isLight ? '#5F6B7A' : '#97A3B3';
  const surface = isLight ? '#FFFFFF' : 'rgba(255,255,255,0.04)';
  const border = isLight ? '#E5E7EB' : '#262E3A';
  const onPrimary = '#1A1206';

  const navLinks = settings.headerNavLinks ?? [];

  return (
    <div
      className="overflow-hidden rounded-card border border-line-strong shadow-lifted transition-colors"
      style={{ background, fontFamily: settings.fontFamily ?? 'Inter', color: text }}
    >
      {/* -------------------------------------------------------------- header */}
      <div
        className="flex items-center justify-between gap-2 border-b px-4 py-2.5"
        style={{ borderColor: border, background: surface }}
      >
        <div className={settings.logoPosition === 'center' ? 'mx-auto flex items-center gap-2' : 'flex items-center gap-2'}>
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="" className="h-6 w-6 rounded object-cover" />
          ) : (
            <div
              className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold"
              style={{ background: settings.primaryColor, color: onPrimary }}
            >
              {restaurantName.charAt(0)}
            </div>
          )}
          <span className="text-xs font-semibold">{restaurantName}</span>
        </div>

        {navLinks.length > 0 && (
          <div className="hidden gap-2 sm:flex">
            {navLinks.slice(0, 3).map((link, index) => (
              <span key={index} className="text-[10px]" style={{ color: muted }}>
                {link.label || '…'}
              </span>
            ))}
          </div>
        )}

        <button
          className="shrink-0 rounded-md px-2.5 py-1 text-[10px] font-semibold"
          style={{ background: settings.primaryColor, color: onPrimary }}
        >
          {settings.orderNowText || 'Order Now'}
        </button>
      </div>

      {settings.showHeaderPhone && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 text-[10px]" style={{ color: muted, background: surface }}>
          <Phone className="h-2.5 w-2.5" /> 03001234567
        </div>
      )}

      {/* ---------------------------------------------------------------- hero */}
      <div
        className="px-5 py-7"
        style={{
          background: `linear-gradient(160deg, ${settings.primaryColor}22, transparent 70%)`,
        }}
      >
        <h3 className="text-lg font-semibold" style={{ color: text }}>
          {settings.heroHeading || restaurantName}
        </h3>

        {settings.tagline && (
          <p className="mt-1 text-xs" style={{ color: muted }}>
            {settings.tagline}
          </p>
        )}

        {settings.allowOnlineOrder && (
          <button
            className="mt-4 rounded-lg px-3.5 py-2 text-xs font-semibold"
            style={{ background: settings.primaryColor, color: onPrimary }}
          >
            {settings.heroButtonText || 'Order Now'}
          </button>
        )}
      </div>

      {/* ------------------------------------------------------- featured/menu */}
      {settings.showMenu !== false && (
        <div className="space-y-2 px-5 pb-5">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: muted }}
          >
            {settings.showFeaturedProducts !== false ? 'Featured' : 'Menu'}
          </p>

          {[
            ['Chicken Karahi', 'Rs 1,250'],
            ['Seekh Kabab', 'Rs 450'],
          ].map(([dish, price]) => (
            <div
              key={dish}
              className="flex items-center justify-between rounded-lg px-3 py-2.5"
              style={{ background: surface }}
            >
              <span className="text-xs" style={{ color: text }}>
                {dish}
              </span>
              {settings.shopShowPrice !== false && (
                <span
                  className="text-xs font-semibold"
                  style={{ color: settings.primaryColor }}
                >
                  {price}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {settings.showAboutSection !== false && settings.aboutText && (
        <div className="border-t px-5 py-4" style={{ borderColor: border }}>
          <p className="line-clamp-2 text-[11px]" style={{ color: muted }}>
            {settings.aboutText}
          </p>
        </div>
      )}

      {settings.showBranches !== false && (
        <div className="border-t px-5 py-4" style={{ borderColor: border }}>
          <div className="flex items-center gap-2">
            <Globe className="h-3 w-3" style={{ color: settings.secondaryColor }} />
            <span className="text-[11px]" style={{ color: muted }}>
              2 branches
            </span>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------- footer */}
      <div className="border-t px-5 py-4" style={{ borderColor: border, background: surface }}>
        {settings.footerAboutText && (
          <p className="text-[10px]" style={{ color: muted }}>{settings.footerAboutText}</p>
        )}
        {settings.footerHours && (
          <p className="mt-1 text-[10px]" style={{ color: muted }}>{settings.footerHours}</p>
        )}

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {settings.facebookUrl && <Facebook className="h-3 w-3" style={{ color: muted }} />}
            {settings.instagramUrl && <Instagram className="h-3 w-3" style={{ color: muted }} />}
          </div>
          <span className="text-[9px]" style={{ color: muted }}>
            {settings.footerCopyrightText || `© ${new Date().getFullYear()} ${restaurantName}`}
          </span>
        </div>
      </div>

      {!settings.isPublished && (
        <div className="flex items-center justify-center gap-2 border-t border-line bg-void/60 py-2.5">
          <Loader2 className="h-3 w-3 text-ink-faint" />
          <span className="text-[11px] text-ink-faint">Not published yet</span>
        </div>
      )}
    </div>
  );
}

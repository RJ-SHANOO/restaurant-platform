import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, Facebook, Instagram, LayoutGrid, List, MapPin, Phone, Search, Store } from 'lucide-react';
import { apiGet } from '@/api/client';
import { endpoints } from '@/api/endpoints';
import { formatMoney } from '@/utils/format';
import { resolveSiteTheme } from '@/utils/siteTheme';
import type { PublicSite } from '@/types/api';

/**
 * A restaurant's own public page - GET /public/sites/:slug rendered.
 *
 * Colours, font and layout all come from the restaurant's theme row, not this
 * app's own dark palette, so every value here is applied as an inline style
 * rather than a Tailwind token. This is what makes the platform a platform
 * rather than a POS: each tenant's storefront looks like its own.
 *
 * The home page's own sections (hero, featured, about, branches) render in
 * whatever order the owner set in the editor. The menu/shop listing is a
 * separate block below them - its own view, not one of the four reorderable
 * sections.
 */

function whatsappUrl(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  return `https://wa.me/${digits}`;
}

function directionsUrl(branch: PublicSite['branches'][number]): string | null {
  if (branch.latitude != null && branch.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${branch.latitude},${branch.longitude}`;
  }
  if (branch.addressLine) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${branch.addressLine}, ${branch.city ?? ''}`)}`;
  }
  return null;
}

/** Where the header's own Order Now button, and the hero's, both point. */
function resolveOrderLink(header: PublicSite['header'], whatsappPhone: string | null): string | null {
  switch (header.orderNowTarget) {
    case 'whatsapp':
      return whatsappPhone ? whatsappUrl(whatsappPhone) : null;
    case 'branches':
      return '#branches';
    case 'custom':
      return header.orderNowUrl;
    case 'menu':
    default:
      return '#menu';
  }
}

export default function PublicSitePage() {
  const { slug = '' } = useParams();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<number | 'all'>('all');

  const { data: site, isLoading, isError } = useQuery({
    queryKey: ['public-site', slug],
    queryFn: () => apiGet<PublicSite>(endpoints.publicSite.bySlug(slug)),
    retry: false,
  });

  const theme = resolveSiteTheme(site?.theme.backgroundShade);
  const { text, muted, surface, border, onPrimary } = theme;

  const featuredProducts = useMemo(() => {
    if (!site) return [];
    return site.menu
      .flatMap((category) => category.products)
      .filter((product) => product.isFeatured)
      .slice(0, site.home.featuredProductsLimit);
  }, [site]);

  const visibleCategories = useMemo(() => {
    if (!site) return [];
    if (!search.trim()) return site.menu;

    const query = search.trim().toLowerCase();
    return site.menu
      .map((category) => ({
        ...category,
        products: category.products.filter((product) => product.name.toLowerCase().includes(query)),
      }))
      .filter((category) => category.products.length > 0);
  }, [site, search]);

  const shownCategories =
    activeCategory === 'all'
      ? visibleCategories
      : visibleCategories.filter((category) => category.id === activeCategory);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-ember" />
      </div>
    );
  }

  if (isError || !site) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <Store className="h-10 w-10 text-ink-faint" />
        <h1 className="mt-5 text-display-md text-ink">No site at this address</h1>
        <p className="mt-2 max-w-xs text-sm text-ink-soft">
          This restaurant has not published a page here yet.
        </p>
      </div>
    );
  }

  const orderLink = resolveOrderLink(site.header, site.content.whatsappPhone);

  const heroSection = (
    <header
      key="hero"
      className="px-6 py-14 sm:px-10"
      style={{
        background: site.theme.bannerUrl
          ? `linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.55)), url(${site.theme.bannerUrl}) center/cover`
          : `linear-gradient(160deg, ${site.theme.primaryColor}33, transparent 70%)`,
      }}
    >
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">
          {site.home.heroHeading || site.restaurant.name}
        </h1>
        {site.content.tagline && <p className="mt-2 text-base" style={{ color: muted }}>{site.content.tagline}</p>}

        {site.content.allowOnlineOrder && orderLink && (
          <div className="mt-6">
            <a
              href={orderLink}
              target={orderLink.startsWith('http') ? '_blank' : undefined}
              rel="noreferrer"
              className="inline-block rounded-lg px-5 py-2.5 text-sm font-semibold"
              style={{ background: site.theme.primaryColor, color: onPrimary }}
            >
              {site.home.heroButtonText}
            </a>
          </div>
        )}

        {(site.content.facebookUrl || site.content.instagramUrl) && (
          <div className="mt-6 flex items-center gap-3">
            {site.content.facebookUrl && (
              <a href={site.content.facebookUrl} target="_blank" rel="noreferrer" style={{ color: muted }}>
                <Facebook className="h-4 w-4" />
              </a>
            )}
            {site.content.instagramUrl && (
              <a href={site.content.instagramUrl} target="_blank" rel="noreferrer" style={{ color: muted }}>
                <Instagram className="h-4 w-4" />
              </a>
            )}
          </div>
        )}
      </div>
    </header>
  );

  const featuredSection = site.home.showFeaturedProducts && featuredProducts.length > 0 && (
    <section key="featured" className="mx-auto max-w-3xl space-y-4 px-6 sm:px-10">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: muted }}>
        Featured
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {featuredProducts.map((product) => (
          <div key={product.id} className="flex items-center gap-3 rounded-lg p-3" style={{ background: surface }}>
            {product.imageUrl && (
              <img src={product.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium">{product.name}</p>
              <p className="mt-0.5 text-sm font-semibold" style={{ color: site.theme.primaryColor }}>
                {formatMoney(product.basePrice, site.restaurant.currencyCode)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const aboutSection = site.home.showAboutSection && site.content.aboutText && (
    <section key="about" className="mx-auto max-w-3xl px-6 sm:px-10">
      <p className="text-sm leading-relaxed" style={{ color: muted }}>{site.content.aboutText}</p>
    </section>
  );

  const branchesSection = site.branches.length > 0 && (
    <section key="branches" id="branches" className="mx-auto max-w-3xl space-y-4 px-6 sm:px-10">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: muted }}>
        {site.branches.length === 1 ? 'Location' : 'Locations'}
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {site.branches.map((branch) => {
          const directions = directionsUrl(branch);
          return (
            <div key={branch.id} className="rounded-lg border p-4" style={{ borderColor: border, background: surface }}>
              <p className="text-sm font-semibold">{branch.name}</p>

              {branch.addressLine && (
                <p className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: muted }}>
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {branch.addressLine}{branch.city ? `, ${branch.city}` : ''}
                </p>
              )}

              {branch.phone && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs" style={{ color: muted }}>
                  <Phone className="h-3.5 w-3.5 shrink-0" /> {branch.phone}
                </p>
              )}

              {(branch.openingTime || branch.closingTime) && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs" style={{ color: muted }}>
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {branch.openingTime ?? '—'} – {branch.closingTime ?? '—'}
                </p>
              )}

              {directions && (
                <a
                  href={directions}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-xs font-semibold"
                  style={{ color: site.theme.primaryColor }}
                >
                  Get directions
                </a>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );

  const sectionByKey: Record<string, React.ReactNode> = {
    hero: heroSection,
    featured: featuredSection,
    about: aboutSection,
    branches: branchesSection,
  };

  return (
    <div style={{ background: theme.background, color: text, fontFamily: site.theme.fontFamily, minHeight: '100vh' }}>
      {/* -------------------------------------------------------------- header */}
      <div
        className={site.header.sticky ? 'sticky top-0 z-10' : undefined}
        style={{ background: theme.background, borderBottom: `1px solid ${border}` }}
      >
        <div
          className={
            site.header.logoPosition === 'center'
              ? 'mx-auto flex max-w-3xl flex-col items-center gap-3 px-6 py-3 sm:px-10'
              : 'mx-auto flex max-w-3xl items-center justify-between gap-3 px-6 py-3 sm:px-10'
          }
        >
          <div className="flex items-center gap-2.5">
            {site.theme.logoUrl ? (
              <img src={site.theme.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold"
                style={{ background: site.theme.primaryColor, color: onPrimary }}
              >
                {site.restaurant.name.charAt(0)}
              </div>
            )}
            <span className="font-display text-sm font-semibold">{site.restaurant.name}</span>
          </div>

          {site.header.navLinks.length > 0 && (
            <nav className="flex flex-wrap items-center gap-4">
              {site.header.navLinks.map((link, index) => (
                <a key={index} href={link.url} className="text-xs font-medium" style={{ color: muted }}>
                  {link.label}
                </a>
              ))}
            </nav>
          )}

          <div className="flex items-center gap-3">
            {site.header.showPhone && (
              <span className="hidden items-center gap-1.5 text-xs sm:flex" style={{ color: muted }}>
                <Phone className="h-3.5 w-3.5" /> {site.restaurant.phone}
              </span>
            )}

            {orderLink && (
              <a
                href={orderLink}
                target={orderLink.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
                className="rounded-lg px-3.5 py-2 text-xs font-semibold"
                style={{ background: site.theme.primaryColor, color: onPrimary }}
              >
                {site.header.orderNowText}
              </a>
            )}
          </div>
        </div>
      </div>

      <main className="space-y-12 py-12">
        {site.home.sectionOrder.map((key) => sectionByKey[key] ?? null)}

        {/* ------------------------------------------------------------- shop */}
        {site.menu.length > 0 && (
          <section id="menu" className="mx-auto max-w-3xl space-y-6 px-6 sm:px-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: muted }}>Menu</h2>

              {site.shop.viewStyle === 'grid' ? (
                <LayoutGrid className="h-4 w-4" style={{ color: muted }} />
              ) : (
                <List className="h-4 w-4" style={{ color: muted }} />
              )}
            </div>

            {site.shop.showSearch && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: muted }} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search the menu"
                  className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm outline-none"
                  style={{ borderColor: border, background: surface, color: text }}
                />
              </div>
            )}

            {site.shop.showCategoryFilter && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveCategory('all')}
                  className="rounded-full border px-3.5 py-1.5 text-xs font-medium"
                  style={
                    activeCategory === 'all'
                      ? { background: site.theme.primaryColor, borderColor: site.theme.primaryColor, color: onPrimary }
                      : { borderColor: border, color: muted }
                  }
                >
                  All
                </button>
                {site.menu.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setActiveCategory(category.id)}
                    className="rounded-full border px-3.5 py-1.5 text-xs font-medium"
                    style={
                      activeCategory === category.id
                        ? { background: site.theme.primaryColor, borderColor: site.theme.primaryColor, color: onPrimary }
                        : { borderColor: border, color: muted }
                    }
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-8">
              {shownCategories.map((category) => (
                <div key={category.id}>
                  <h3 className="mb-3 text-lg font-semibold">{category.name}</h3>
                  <div
                    className={
                      site.shop.viewStyle === 'grid'
                        ? 'grid gap-3'
                        : 'space-y-2.5'
                    }
                    style={
                      site.shop.viewStyle === 'grid'
                        ? { gridTemplateColumns: `repeat(${site.shop.itemsPerRow}, minmax(0, 1fr))` }
                        : undefined
                    }
                  >
                    {category.products.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center gap-3 rounded-lg p-3"
                        style={{ background: surface }}
                      >
                        {site.shop.showProductImage && product.imageUrl && (
                          <img src={product.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{product.name}</p>
                          {product.description && (
                            <p className="mt-0.5 line-clamp-1 text-xs" style={{ color: muted }}>{product.description}</p>
                          )}
                        </div>
                        {site.shop.showPrice && (
                          <span className="shrink-0 text-sm font-semibold" style={{ color: site.theme.primaryColor }}>
                            {formatMoney(product.basePrice, site.restaurant.currencyCode)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* -------------------------------------------------------------- footer */}
      <SiteFooter site={site} theme={theme} />
    </div>
  );
}

function SiteFooter({ site, theme }: { site: PublicSite; theme: ReturnType<typeof resolveSiteTheme> }) {
  const { muted, border, surface } = theme;
  const copyright = site.footer.copyrightText || `© ${new Date().getFullYear()} ${site.restaurant.name}`;

  const socials = (
    <div className="flex items-center gap-3">
      {site.content.facebookUrl && (
        <a href={site.content.facebookUrl} target="_blank" rel="noreferrer" style={{ color: muted }}>
          <Facebook className="h-4 w-4" />
        </a>
      )}
      {site.content.instagramUrl && (
        <a href={site.content.instagramUrl} target="_blank" rel="noreferrer" style={{ color: muted }}>
          <Instagram className="h-4 w-4" />
        </a>
      )}
      {site.content.whatsappPhone && (
        <a href={whatsappUrl(site.content.whatsappPhone)} target="_blank" rel="noreferrer" style={{ color: muted }}>
          WhatsApp
        </a>
      )}
    </div>
  );

  if (site.footer.layout === 'minimal') {
    return (
      <footer className="border-t px-6 py-6 text-center text-xs sm:px-10" style={{ borderColor: border, color: muted }}>
        {copyright}
      </footer>
    );
  }

  if (site.footer.layout === 'columns') {
    return (
      <footer className="border-t px-6 py-10 sm:px-10" style={{ borderColor: border, background: surface }}>
        <div className="mx-auto grid max-w-3xl gap-8 sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold">{site.restaurant.name}</p>
            {site.footer.aboutText && <p className="mt-2 text-xs" style={{ color: muted }}>{site.footer.aboutText}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: muted }}>Hours</p>
            <p className="mt-2 text-xs" style={{ color: muted }}>{site.footer.hours ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: muted }}>Follow</p>
            <div className="mt-2">{socials}</div>
          </div>
        </div>
        <p className="mx-auto mt-8 max-w-3xl text-xs" style={{ color: muted }}>{copyright}</p>
      </footer>
    );
  }

  // simple
  return (
    <footer className="border-t px-6 py-8 text-center sm:px-10" style={{ borderColor: border }}>
      <div className="mx-auto max-w-3xl space-y-2">
        {site.footer.aboutText && <p className="text-xs" style={{ color: muted }}>{site.footer.aboutText}</p>}
        {site.footer.hours && <p className="text-xs" style={{ color: muted }}>{site.footer.hours}</p>}
        <div className="flex items-center justify-center gap-3">{socials}</div>
        <p className="text-xs" style={{ color: muted }}>{copyright}</p>
      </div>
    </footer>
  );
}

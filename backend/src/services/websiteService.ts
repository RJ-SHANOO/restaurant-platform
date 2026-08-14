import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { HttpError } from '../utils/apiResponse';

/**
 * The restaurant's own public website.
 *
 * This is the module that makes the platform a platform rather than a POS: a
 * restaurant registers and gets a site of its own, in its own colours, listing
 * its own branches - without anyone at the platform doing anything.
 *
 * The theme is held as discrete columns rather than a JSON blob so a bad value
 * can be rejected on the way in, and so a colour can be queried or reported on
 * later. The only JSON columns are header nav links and home section order,
 * because those are restaurant-managed lists with nothing to query them by.
 */

const HEX_COLOUR = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const INTERNAL_OR_HTTP_URL = /^(\/[^\s]*|https?:\/\/[^\s]+)$/;

const ALLOWED_SHADES = ['dark', 'midnight', 'slate', 'light'] as const;
const ALLOWED_LAYOUTS = ['classic', 'bold', 'minimal'] as const;
const ALLOWED_FONTS = ['Inter', 'Sora', 'Poppins', 'Playfair Display', 'Manrope'] as const;

const ALLOWED_LOGO_POSITIONS = ['left', 'center'] as const;
const ALLOWED_ORDER_NOW_TARGETS = ['menu', 'whatsapp', 'branches', 'custom'] as const;
const ALLOWED_FOOTER_LAYOUTS = ['simple', 'columns', 'minimal'] as const;
const ALLOWED_SHOP_VIEW_STYLES = ['grid', 'list'] as const;
const ALLOWED_SHOP_ITEMS_PER_ROW = [2, 3, 4, 5] as const;
const ALLOWED_FEATURED_LIMITS = [2, 3, 4, 6, 8] as const;
const HOME_SECTION_KEYS = ['hero', 'featured', 'about', 'branches'] as const;

export type BackgroundShade = (typeof ALLOWED_SHADES)[number];
export type LayoutStyle = (typeof ALLOWED_LAYOUTS)[number];

export interface NavLinkInput {
  label: string;
  url: string;
}

export interface ThemeInput {
  primaryColor?: string;
  secondaryColor?: string;
  backgroundShade?: string;
  fontFamily?: string;
  layoutStyle?: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  tagline?: string | null;
  aboutText?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  whatsappPhone?: string | null;
  showMenu?: boolean;
  showBranches?: boolean;
  allowOnlineOrder?: boolean;

  // Header
  logoPosition?: string;
  headerSticky?: boolean;
  showHeaderPhone?: boolean;
  orderNowText?: string;
  orderNowTarget?: string;
  orderNowUrl?: string | null;
  headerNavLinks?: NavLinkInput[];

  // Footer
  footerAboutText?: string | null;
  footerHours?: string | null;
  footerCopyrightText?: string | null;
  footerLayout?: string;

  // Home
  heroHeading?: string | null;
  heroButtonText?: string;
  showFeaturedProducts?: boolean;
  featuredProductsLimit?: number;
  showAboutSection?: boolean;
  homeSectionOrder?: string[];

  // Shop
  shopViewStyle?: string;
  shopItemsPerRow?: number;
  shopShowPrice?: boolean;
  shopShowCategoryFilter?: boolean;
  shopShowSearch?: boolean;
  shopShowProductImage?: boolean;
}

function assertColour(field: string, value?: string) {
  if (value !== undefined && !HEX_COLOUR.test(value)) {
    throw HttpError.validation({
      [field]: ['Use a hex colour such as #F5A524.'],
    });
  }
}

function assertOneOf(field: string, value: string | undefined, allowed: readonly string[]) {
  if (value !== undefined && !allowed.includes(value)) {
    throw HttpError.validation({
      [field]: [`Choose one of: ${allowed.join(', ')}.`],
    });
  }
}

function assertIntOneOf(field: string, value: number | undefined, allowed: readonly number[]) {
  if (value !== undefined && !allowed.includes(value)) {
    throw HttpError.validation({
      [field]: [`Choose one of: ${allowed.join(', ')}.`],
    });
  }
}

function assertUrl(field: string, value?: string | null) {
  if (value !== undefined && value !== null && value !== '' && !INTERNAL_OR_HTTP_URL.test(value)) {
    throw HttpError.validation({
      [field]: ['Use a page path starting with / or a full https:// link.'],
    });
  }
}

/**
 * A restaurant-managed list, but still not free-form: each entry is one label
 * and one URL, both bounded, and the URL is checked the same way any other
 * link on this record is - never a javascript: or data: scheme.
 */
function assertNavLinks(links: NavLinkInput[] | undefined) {
  if (links === undefined) return;

  if (links.length > 6) {
    throw HttpError.validation({ headerNavLinks: ['Up to 6 links.'] });
  }

  links.forEach((link, index) => {
    if (typeof link.label !== 'string' || link.label.trim().length === 0 || link.label.length > 40) {
      throw HttpError.validation({
        [`headerNavLinks.${index}.label`]: ['A label of 1-40 characters is required.'],
      });
    }
    if (typeof link.url !== 'string' || !INTERNAL_OR_HTTP_URL.test(link.url) || link.url.length > 300) {
      throw HttpError.validation({
        [`headerNavLinks.${index}.url`]: ['Use a page path starting with / or a full https:// link.'],
      });
    }
  });
}

/** Must be exactly the four known sections, each appearing once. */
function assertSectionOrder(order: string[] | undefined) {
  if (order === undefined) return;

  const isPermutation =
    order.length === HOME_SECTION_KEYS.length &&
    HOME_SECTION_KEYS.every((key) => order.includes(key));

  if (!isPermutation) {
    throw HttpError.validation({
      homeSectionOrder: [`Must contain each of ${HOME_SECTION_KEYS.join(', ')} exactly once.`],
    });
  }
}

export const websiteService = {
  /** The restaurant's own view of its site, published or not. */
  async getForOwner(restaurantId: number) {
    const website = await prisma.restaurantWebsite.findUnique({
      where: { restaurantId },
    });

    // Registration creates this row, but a restaurant onboarded before that
    // change - or by an import - may not have one.
    if (!website) {
      return prisma.restaurantWebsite.create({ data: { restaurantId } });
    }

    return website;
  },

  /**
   * Updates the theme and content.
   *
   * Every value is validated against a fixed set or a bounded shape. Free-form
   * CSS is deliberately not accepted: a restaurant pasting arbitrary styles
   * into a page the platform serves is a route to both broken layouts and
   * script injection.
   */
  async updateTheme(restaurantId: number, input: ThemeInput) {
    assertColour('primaryColor', input.primaryColor);
    assertColour('secondaryColor', input.secondaryColor);
    assertOneOf('backgroundShade', input.backgroundShade, ALLOWED_SHADES);
    assertOneOf('layoutStyle', input.layoutStyle, ALLOWED_LAYOUTS);
    assertOneOf('fontFamily', input.fontFamily, ALLOWED_FONTS);

    assertOneOf('logoPosition', input.logoPosition, ALLOWED_LOGO_POSITIONS);
    assertOneOf('orderNowTarget', input.orderNowTarget, ALLOWED_ORDER_NOW_TARGETS);
    assertUrl('orderNowUrl', input.orderNowUrl);
    assertNavLinks(input.headerNavLinks);

    assertOneOf('footerLayout', input.footerLayout, ALLOWED_FOOTER_LAYOUTS);

    assertSectionOrder(input.homeSectionOrder);
    assertIntOneOf('featuredProductsLimit', input.featuredProductsLimit, ALLOWED_FEATURED_LIMITS);

    assertOneOf('shopViewStyle', input.shopViewStyle, ALLOWED_SHOP_VIEW_STYLES);
    assertIntOneOf('shopItemsPerRow', input.shopItemsPerRow, ALLOWED_SHOP_ITEMS_PER_ROW);

    // A custom order-now link only means something when the target is
    // "custom" - otherwise it is stale data from a previous choice.
    const orderNowUrl =
      input.orderNowTarget !== undefined
        ? input.orderNowTarget === 'custom'
          ? (input.orderNowUrl ?? null)
          : null
        : input.orderNowUrl;

    if (input.orderNowTarget === 'custom' && !orderNowUrl) {
      throw HttpError.validation({ orderNowUrl: ['Add a link for a custom Order Now button.'] });
    }

    await this.getForOwner(restaurantId);

    return prisma.restaurantWebsite.update({
      where: { restaurantId },
      data: {
        ...(input.primaryColor !== undefined && { primaryColor: input.primaryColor }),
        ...(input.secondaryColor !== undefined && { secondaryColor: input.secondaryColor }),
        ...(input.backgroundShade !== undefined && { backgroundShade: input.backgroundShade }),
        ...(input.fontFamily !== undefined && { fontFamily: input.fontFamily }),
        ...(input.layoutStyle !== undefined && { layoutStyle: input.layoutStyle }),
        ...(input.logoUrl !== undefined && { logoUrl: input.logoUrl }),
        ...(input.bannerUrl !== undefined && { bannerUrl: input.bannerUrl }),
        ...(input.tagline !== undefined && { tagline: input.tagline }),
        ...(input.aboutText !== undefined && { aboutText: input.aboutText }),
        ...(input.facebookUrl !== undefined && { facebookUrl: input.facebookUrl }),
        ...(input.instagramUrl !== undefined && { instagramUrl: input.instagramUrl }),
        ...(input.whatsappPhone !== undefined && { whatsappPhone: input.whatsappPhone }),
        ...(input.showMenu !== undefined && { showMenu: input.showMenu }),
        ...(input.showBranches !== undefined && { showBranches: input.showBranches }),
        ...(input.allowOnlineOrder !== undefined && { allowOnlineOrder: input.allowOnlineOrder }),

        ...(input.logoPosition !== undefined && { logoPosition: input.logoPosition }),
        ...(input.headerSticky !== undefined && { headerSticky: input.headerSticky }),
        ...(input.showHeaderPhone !== undefined && { showHeaderPhone: input.showHeaderPhone }),
        ...(input.orderNowText !== undefined && { orderNowText: input.orderNowText }),
        ...(input.orderNowTarget !== undefined && { orderNowTarget: input.orderNowTarget, orderNowUrl }),
        ...(input.orderNowTarget === undefined && input.orderNowUrl !== undefined && { orderNowUrl }),
        ...(input.headerNavLinks !== undefined && {
          headerNavLinks: input.headerNavLinks as unknown as Prisma.InputJsonValue,
        }),

        ...(input.footerAboutText !== undefined && { footerAboutText: input.footerAboutText }),
        ...(input.footerHours !== undefined && { footerHours: input.footerHours }),
        ...(input.footerCopyrightText !== undefined && { footerCopyrightText: input.footerCopyrightText }),
        ...(input.footerLayout !== undefined && { footerLayout: input.footerLayout }),

        ...(input.heroHeading !== undefined && { heroHeading: input.heroHeading }),
        ...(input.heroButtonText !== undefined && { heroButtonText: input.heroButtonText }),
        ...(input.showFeaturedProducts !== undefined && { showFeaturedProducts: input.showFeaturedProducts }),
        ...(input.featuredProductsLimit !== undefined && { featuredProductsLimit: input.featuredProductsLimit }),
        ...(input.showAboutSection !== undefined && { showAboutSection: input.showAboutSection }),
        ...(input.homeSectionOrder !== undefined && {
          homeSectionOrder: input.homeSectionOrder as unknown as Prisma.InputJsonValue,
        }),

        ...(input.shopViewStyle !== undefined && { shopViewStyle: input.shopViewStyle }),
        ...(input.shopItemsPerRow !== undefined && { shopItemsPerRow: input.shopItemsPerRow }),
        ...(input.shopShowPrice !== undefined && { shopShowPrice: input.shopShowPrice }),
        ...(input.shopShowCategoryFilter !== undefined && { shopShowCategoryFilter: input.shopShowCategoryFilter }),
        ...(input.shopShowSearch !== undefined && { shopShowSearch: input.shopShowSearch }),
        ...(input.shopShowProductImage !== undefined && { shopShowProductImage: input.shopShowProductImage }),
      },
    });
  },

  async setPublished(restaurantId: number, isPublished: boolean) {
    await this.getForOwner(restaurantId);

    return prisma.restaurantWebsite.update({
      where: { restaurantId },
      data: { isPublished },
    });
  },

  /**
   * What a visitor to restaurant-slug's public site sees.
   *
   * Unauthenticated, so it returns only what a stranger should see: the theme,
   * the menu, the branch addresses. No staff, no revenue, no order history, and
   * no QR tokens - a table's token is its credential and must never appear on a
   * public page.
   */
  async publicSite(slug: string) {
    const restaurant = await prisma.restaurant.findFirst({
      where: { slug, deletedAt: null, status: 'active' },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        currencyCode: true,
        contactPhone: true,
        website: true,
      },
    });

    if (!restaurant?.website?.isPublished) {
      throw HttpError.notFound('No published site at that address.');
    }

    const site = restaurant.website;

    const [branches, categories] = await Promise.all([
      site.showBranches
        ? prisma.branch.findMany({
            where: { restaurantId: restaurant.id, status: 'active', deletedAt: null },
            select: {
              id: true,
              name: true,
              addressLine: true,
              city: true,
              phone: true,
              latitude: true,
              longitude: true,
              openingTime: true,
              closingTime: true,
              acceptsDelivery: true,
              acceptsTakeaway: true,
            },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),

      site.showMenu
        ? prisma.category.findMany({
            where: { restaurantId: restaurant.id, isActive: true, deletedAt: null },
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              name: true,
              description: true,
              imageUrl: true,
              products: {
                where: { isAvailable: true, deletedAt: null },
                orderBy: { sortOrder: 'asc' },
                select: {
                  id: true,
                  name: true,
                  description: true,
                  imageUrl: true,
                  basePrice: true,
                  isFeatured: true,
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    return {
      restaurant: {
        name: restaurant.name,
        slug: restaurant.slug,
        city: restaurant.city,
        currencyCode: restaurant.currencyCode,
        phone: restaurant.contactPhone,
      },
      theme: {
        primaryColor: site.primaryColor,
        secondaryColor: site.secondaryColor,
        backgroundShade: site.backgroundShade,
        fontFamily: site.fontFamily,
        layoutStyle: site.layoutStyle,
        logoUrl: site.logoUrl,
        bannerUrl: site.bannerUrl,
      },
      content: {
        tagline: site.tagline,
        aboutText: site.aboutText,
        facebookUrl: site.facebookUrl,
        instagramUrl: site.instagramUrl,
        whatsappPhone: site.whatsappPhone,
        allowOnlineOrder: site.allowOnlineOrder,
      },
      header: {
        logoPosition: site.logoPosition,
        sticky: site.headerSticky,
        showPhone: site.showHeaderPhone,
        orderNowText: site.orderNowText,
        orderNowTarget: site.orderNowTarget,
        orderNowUrl: site.orderNowUrl,
        navLinks: site.headerNavLinks as unknown as NavLinkInput[],
      },
      footer: {
        aboutText: site.footerAboutText,
        hours: site.footerHours,
        copyrightText: site.footerCopyrightText,
        layout: site.footerLayout,
      },
      home: {
        heroHeading: site.heroHeading,
        heroButtonText: site.heroButtonText,
        showFeaturedProducts: site.showFeaturedProducts,
        featuredProductsLimit: site.featuredProductsLimit,
        showAboutSection: site.showAboutSection,
        sectionOrder: site.homeSectionOrder as unknown as string[],
      },
      shop: {
        viewStyle: site.shopViewStyle,
        itemsPerRow: site.shopItemsPerRow,
        showPrice: site.shopShowPrice,
        showCategoryFilter: site.shopShowCategoryFilter,
        showSearch: site.shopShowSearch,
        showProductImage: site.shopShowProductImage,
      },
      branches: branches.map((branch) => ({
        ...branch,
        latitude: branch.latitude ? Number(branch.latitude) : null,
        longitude: branch.longitude ? Number(branch.longitude) : null,
      })),
      menu: categories
        .filter((category) => category.products.length > 0)
        .map((category) => ({
          ...category,
          products: category.products.map((product) => ({
            ...product,
            basePrice: Number(product.basePrice),
          })),
        })),
    };
  },

  themeOptions() {
    return {
      backgroundShades: ALLOWED_SHADES,
      layoutStyles: ALLOWED_LAYOUTS,
      fontFamilies: ALLOWED_FONTS,
      logoPositions: ALLOWED_LOGO_POSITIONS,
      orderNowTargets: ALLOWED_ORDER_NOW_TARGETS,
      footerLayouts: ALLOWED_FOOTER_LAYOUTS,
      shopViewStyles: ALLOWED_SHOP_VIEW_STYLES,
      shopItemsPerRowOptions: ALLOWED_SHOP_ITEMS_PER_ROW,
      featuredProductsLimitOptions: ALLOWED_FEATURED_LIMITS,
      homeSectionKeys: HOME_SECTION_KEYS,
    };
  },
};

import type { SiteNavLink } from '@/types/api';

/**
 * The shape of one `RestaurantWebsite` row as the editor sees it: every
 * column the API returns, plus the fixed-set options it validates against.
 * Shared by the editor page, its five tabs and the live preview so a field
 * added to one is available to all without re-declaring the shape.
 */
export interface WebsiteSettings {
  isPublished: boolean;

  primaryColor: string;
  secondaryColor: string;
  backgroundShade: string;
  fontFamily: string;
  layoutStyle: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  tagline: string | null;
  aboutText: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  whatsappPhone: string | null;
  showMenu: boolean;
  showBranches: boolean;
  allowOnlineOrder: boolean;

  // Header
  logoPosition: string;
  headerSticky: boolean;
  showHeaderPhone: boolean;
  orderNowText: string;
  orderNowTarget: string;
  orderNowUrl: string | null;
  headerNavLinks: SiteNavLink[];

  // Footer
  footerAboutText: string | null;
  footerHours: string | null;
  footerCopyrightText: string | null;
  footerLayout: string;

  // Home
  heroHeading: string | null;
  heroButtonText: string;
  showFeaturedProducts: boolean;
  featuredProductsLimit: number;
  showAboutSection: boolean;
  homeSectionOrder: string[];

  // Shop
  shopViewStyle: string;
  shopItemsPerRow: number;
  shopShowPrice: boolean;
  shopShowCategoryFilter: boolean;
  shopShowSearch: boolean;
  shopShowProductImage: boolean;

  options: {
    backgroundShades: string[];
    layoutStyles: string[];
    fontFamilies: string[];
    logoPositions: string[];
    orderNowTargets: string[];
    footerLayouts: string[];
    shopViewStyles: string[];
    shopItemsPerRowOptions: number[];
    featuredProductsLimitOptions: number[];
    homeSectionKeys: string[];
  };
}

export const HOME_SECTION_LABELS: Record<string, string> = {
  hero: 'Hero banner',
  featured: 'Featured dishes',
  about: 'About',
  branches: 'Our branches',
};

export interface TabProps {
  value: Partial<WebsiteSettings> & Pick<WebsiteSettings, 'options'>;
  set: <K extends keyof WebsiteSettings>(key: K, next: WebsiteSettings[K]) => void;
}

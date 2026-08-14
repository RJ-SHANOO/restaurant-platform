import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse } from '../utils/apiResponse';
import { websiteService } from '../services/websiteService';

/**
 * The restaurant's control over its own public site.
 */

const navLinkSchema = z.object({
  label: z.string().min(1).max(40),
  url: z.string().min(1).max(300),
});

const themeSchema = z.object({
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  backgroundShade: z.string().optional(),
  fontFamily: z.string().optional(),
  layoutStyle: z.string().optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  bannerUrl: z.string().url().max(500).nullable().optional(),
  tagline: z.string().max(200).nullable().optional(),
  aboutText: z.string().max(4000).nullable().optional(),
  facebookUrl: z.string().url().max(255).nullable().optional(),
  instagramUrl: z.string().url().max(255).nullable().optional(),
  whatsappPhone: z.string().max(30).nullable().optional(),
  showMenu: z.boolean().optional(),
  showBranches: z.boolean().optional(),
  allowOnlineOrder: z.boolean().optional(),

  // Header
  logoPosition: z.string().optional(),
  headerSticky: z.boolean().optional(),
  showHeaderPhone: z.boolean().optional(),
  orderNowText: z.string().min(1).max(40).optional(),
  orderNowTarget: z.string().optional(),
  orderNowUrl: z.string().max(500).nullable().optional(),
  headerNavLinks: z.array(navLinkSchema).max(6).optional(),

  // Footer
  footerAboutText: z.string().max(300).nullable().optional(),
  footerHours: z.string().max(200).nullable().optional(),
  footerCopyrightText: z.string().max(200).nullable().optional(),
  footerLayout: z.string().optional(),

  // Home
  heroHeading: z.string().max(150).nullable().optional(),
  heroButtonText: z.string().min(1).max(40).optional(),
  showFeaturedProducts: z.boolean().optional(),
  featuredProductsLimit: z.number().int().optional(),
  showAboutSection: z.boolean().optional(),
  homeSectionOrder: z.array(z.string()).optional(),

  // Shop
  shopViewStyle: z.string().optional(),
  shopItemsPerRow: z.number().int().optional(),
  shopShowPrice: z.boolean().optional(),
  shopShowCategoryFilter: z.boolean().optional(),
  shopShowSearch: z.boolean().optional(),
  shopShowProductImage: z.boolean().optional(),
});

export const websiteController = {
  async show(req: Request, res: Response, next: NextFunction) {
    try {
      const website = await websiteService.getForOwner(req.tenantId!);

      return apiResponse.success(res, {
        ...website,
        options: websiteService.themeOptions(),
      });
    } catch (error) {
      next(error);
    }
  },

  async updateTheme(req: Request, res: Response, next: NextFunction) {
    try {
      const input = themeSchema.parse(req.body);
      const website = await websiteService.updateTheme(req.tenantId!, input);

      return apiResponse.success(res, website, 'Website updated.');
    } catch (error) {
      next(error);
    }
  },

  async setPublished(req: Request, res: Response, next: NextFunction) {
    try {
      const { isPublished } = z.object({ isPublished: z.boolean() }).parse(req.body);
      const website = await websiteService.setPublished(req.tenantId!, isPublished);

      return apiResponse.success(
        res,
        website,
        isPublished ? 'Your site is now live.' : 'Your site has been taken offline.',
      );
    } catch (error) {
      next(error);
    }
  },

  /** Unauthenticated. What a visitor sees at the restaurant's public address. */
  async publicSite(req: Request, res: Response, next: NextFunction) {
    try {
      const site = await websiteService.publicSite(req.params.slug);

      return apiResponse.success(res, site);
    } catch (error) {
      next(error);
    }
  },
};

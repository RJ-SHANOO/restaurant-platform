import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse } from '../utils/apiResponse';
import { menuService } from '../services/menuService';

/**
 * Menu management: categories, products (with variants and modifier groups),
 * and modifier groups (with their modifiers).
 *
 * Three resources in one file because they share this one module and lean on
 * each other constantly - a product form needs the category list and the
 * modifier group list in the same breath.
 */

const categorySchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(255).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  parentId: z.number().int().positive().optional().nullable(),
});

const variantSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(1).max(80),
  priceDelta: z.number().default(0),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

const productSchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().min(2).max(150),
  description: z.string().max(500).optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  basePrice: z.number().min(0),
  preparationMinutes: z.number().int().min(0).max(240).default(10),
  tracksInventory: z.boolean().default(false),
  isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  variants: z.array(variantSchema).default([]),
  modifierGroupIds: z.array(z.number().int().positive()).default([]),
});

const modifierSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(1).max(120),
  priceDelta: z.number().default(0),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const modifierGroupBaseSchema = z.object({
  name: z.string().min(2).max(120),
  selectionType: z.enum(['single', 'multiple']).default('single'),
  minSelections: z.number().int().min(0).default(0),
  maxSelections: z.number().int().min(1).default(1),
  isRequired: z.boolean().default(false),
  modifiers: z.array(modifierSchema).default([]),
});

const selectionsInOrder = (data: { minSelections?: number; maxSelections?: number }) =>
  data.minSelections === undefined ||
  data.maxSelections === undefined ||
  data.maxSelections >= data.minSelections;

const selectionsRefinement = {
  message: 'Maximum selections cannot be less than minimum selections.',
  path: ['maxSelections'],
};

const modifierGroupSchema = modifierGroupBaseSchema.refine(selectionsInOrder, selectionsRefinement);

export const menuController = {
  // -------------------------------------------------------------- categories

  async categoryIndex(req: Request, res: Response, next: NextFunction) {
    try {
      const categories = await menuService.listCategories(req.tenantId!);
      return apiResponse.success(res, categories.map(serialiseCategory));
    } catch (error) {
      next(error);
    }
  },

  async categoryStore(req: Request, res: Response, next: NextFunction) {
    try {
      const input = categorySchema.parse(req.body);
      const category = await menuService.createCategory(req.tenantId!, input);
      return apiResponse.created(res, serialiseCategory(category), `${category.name} added.`);
    } catch (error) {
      next(error);
    }
  },

  async categoryUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const input = categorySchema.partial().parse(req.body);
      const category = await menuService.updateCategory(req.tenantId!, Number(req.params.id), input);
      return apiResponse.success(res, serialiseCategory(category), 'Category updated.');
    } catch (error) {
      next(error);
    }
  },

  async categoryDestroy(req: Request, res: Response, next: NextFunction) {
    try {
      await menuService.deleteCategory(req.tenantId!, Number(req.params.id));
      return apiResponse.noContent(res, 'Category removed.');
    } catch (error) {
      next(error);
    }
  },

  // ---------------------------------------------------------------- products

  async productIndex(req: Request, res: Response, next: NextFunction) {
    try {
      const { categoryId, search, isAvailable } = req.query;

      const products = await menuService.listProducts(req.tenantId!, {
        categoryId: categoryId ? Number(categoryId) : undefined,
        search: typeof search === 'string' ? search : undefined,
        isAvailable: isAvailable === undefined ? undefined : isAvailable === 'true',
      });

      return apiResponse.success(res, products.map(serialiseProduct));
    } catch (error) {
      next(error);
    }
  },

  async productShow(req: Request, res: Response, next: NextFunction) {
    try {
      const product = await menuService.getProduct(req.tenantId!, Number(req.params.id));
      return apiResponse.success(res, serialiseProduct(product));
    } catch (error) {
      next(error);
    }
  },

  async productStore(req: Request, res: Response, next: NextFunction) {
    try {
      const input = productSchema.parse(req.body);
      const product = await menuService.createProduct(req.tenantId!, input);
      return apiResponse.created(res, serialiseProduct(product), `${product.name} added.`);
    } catch (error) {
      next(error);
    }
  },

  async productUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const input = productSchema.partial().parse(req.body);
      const product = await menuService.updateProduct(req.tenantId!, Number(req.params.id), input);
      return apiResponse.success(res, serialiseProduct(product!), 'Item updated.');
    } catch (error) {
      next(error);
    }
  },

  async productDestroy(req: Request, res: Response, next: NextFunction) {
    try {
      await menuService.deleteProduct(req.tenantId!, Number(req.params.id));
      return apiResponse.noContent(res, 'Item removed.');
    } catch (error) {
      next(error);
    }
  },

  // --------------------------------------------------------- modifier groups

  async modifierGroupIndex(req: Request, res: Response, next: NextFunction) {
    try {
      const groups = await menuService.listModifierGroups(req.tenantId!);
      return apiResponse.success(res, groups.map(serialiseModifierGroup));
    } catch (error) {
      next(error);
    }
  },

  async modifierGroupStore(req: Request, res: Response, next: NextFunction) {
    try {
      const input = modifierGroupSchema.parse(req.body);
      const group = await menuService.createModifierGroup(req.tenantId!, input);
      return apiResponse.created(res, serialiseModifierGroup(group), `${group.name} added.`);
    } catch (error) {
      next(error);
    }
  },

  async modifierGroupUpdate(req: Request, res: Response, next: NextFunction) {
    try {
      const input = modifierGroupBaseSchema.partial().refine(selectionsInOrder, selectionsRefinement).parse(req.body);
      const group = await menuService.updateModifierGroup(req.tenantId!, Number(req.params.id), input);
      return apiResponse.success(res, serialiseModifierGroup(group!), 'Modifier group updated.');
    } catch (error) {
      next(error);
    }
  },

  async modifierGroupDestroy(req: Request, res: Response, next: NextFunction) {
    try {
      await menuService.deleteModifierGroup(req.tenantId!, Number(req.params.id));
      return apiResponse.noContent(res, 'Modifier group removed.');
    } catch (error) {
      next(error);
    }
  },
};

function serialiseCategory(category: Record<string, unknown>) {
  const counts = category._count as Record<string, number> | undefined;

  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    imageUrl: category.imageUrl,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    parentId: category.parentId,
    productCount: counts?.products ?? 0,
    createdAt: category.createdAt,
  };
}

function serialiseProduct(product: Record<string, unknown>) {
  const category = product.category as { id: number; name: string } | null;
  const variants = (product.variants as Record<string, unknown>[] | undefined) ?? [];
  const modifierGroups =
    (product.modifierGroups as Array<{ group: Record<string, unknown> }> | undefined) ?? [];

  return {
    id: product.id,
    categoryId: product.categoryId,
    category,
    name: product.name,
    slug: product.slug,
    description: product.description,
    imageUrl: product.imageUrl,
    basePrice: Number(product.basePrice),
    preparationMinutes: product.preparationMinutes,
    tracksInventory: product.tracksInventory,
    isAvailable: product.isAvailable,
    isFeatured: product.isFeatured,
    sortOrder: product.sortOrder,
    variants: variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      priceDelta: Number(variant.priceDelta),
      isDefault: variant.isDefault,
      sortOrder: variant.sortOrder,
    })),
    modifierGroups: modifierGroups.map(({ group }) => serialiseModifierGroup(group)),
    createdAt: product.createdAt,
  };
}

function serialiseModifierGroup(group: Record<string, unknown>) {
  const modifiers = (group.modifiers as Record<string, unknown>[] | undefined) ?? [];
  const counts = group._count as Record<string, number> | undefined;

  return {
    id: group.id,
    name: group.name,
    selectionType: group.selectionType,
    minSelections: group.minSelections,
    maxSelections: group.maxSelections,
    isRequired: group.isRequired,
    productCount: counts?.products,
    modifiers: modifiers.map((modifier) => ({
      id: modifier.id,
      name: modifier.name,
      priceDelta: Number(modifier.priceDelta),
      isAvailable: modifier.isAvailable,
      sortOrder: modifier.sortOrder,
    })),
  };
}

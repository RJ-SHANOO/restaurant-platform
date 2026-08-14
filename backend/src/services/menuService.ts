import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { HttpError } from '../utils/apiResponse';

type Tx = Prisma.TransactionClient;

/**
 * Menu management: categories, products, variants and modifier groups.
 *
 * Like orderService, this takes an explicit restaurantId rather than req.db -
 * the nested writes below (a product with its variants, a modifier group with
 * its modifiers) need to run inside one prisma.$transaction, and every read
 * and write in that transaction filters by restaurantId by hand.
 */

export interface CategoryInput {
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  parentId?: number | null;
}

export interface VariantInput {
  id?: number;
  name: string;
  priceDelta?: number;
  isDefault?: boolean;
  sortOrder?: number;
}

export interface ProductInput {
  categoryId: number;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  basePrice: number;
  preparationMinutes?: number;
  tracksInventory?: boolean;
  isAvailable?: boolean;
  isFeatured?: boolean;
  sortOrder?: number;
  variants?: VariantInput[];
  modifierGroupIds?: number[];
}

export interface ModifierInput {
  id?: number;
  name: string;
  priceDelta?: number;
  isAvailable?: boolean;
  sortOrder?: number;
}

export interface ModifierGroupInput {
  name: string;
  selectionType?: 'single' | 'multiple';
  minSelections?: number;
  maxSelections?: number;
  isRequired?: boolean;
  modifiers?: ModifierInput[];
}

const productInclude = {
  category: { select: { id: true, name: true } },
  variants: { orderBy: { sortOrder: 'asc' as const } },
  modifierGroups: { include: { group: { include: { modifiers: { orderBy: { sortOrder: 'asc' as const } } } } } },
};

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);

  return base || 'item';
}

async function uniqueCategorySlug(tx: Tx, restaurantId: number, name: string, excludeId?: number) {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;

  while (
    await tx.category.findFirst({
      where: { restaurantId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
  ) {
    slug = `${base}-${suffix++}`;
  }

  return slug;
}

async function uniqueProductSlug(tx: Tx, restaurantId: number, name: string, excludeId?: number) {
  const base = slugify(name);
  let slug = base;
  let suffix = 2;

  while (
    await tx.product.findFirst({
      where: { restaurantId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
  ) {
    slug = `${base}-${suffix++}`;
  }

  return slug;
}

export const menuService = {
  // -------------------------------------------------------------- categories

  async listCategories(restaurantId: number) {
    return prisma.category.findMany({
      where: { restaurantId, deletedAt: null },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  },

  async createCategory(restaurantId: number, input: CategoryInput) {
    return prisma.$transaction(async (tx) => {
      if (input.parentId) {
        const parent = await tx.category.findFirst({
          where: { id: input.parentId, restaurantId, deletedAt: null },
        });
        if (!parent) {
          throw HttpError.validation({ parentId: ['That parent category does not exist.'] });
        }
      }

      const slug = await uniqueCategorySlug(tx, restaurantId, input.name);

      return tx.category.create({
        data: {
          restaurantId,
          name: input.name,
          slug,
          description: input.description ?? null,
          imageUrl: input.imageUrl ?? null,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
          parentId: input.parentId ?? null,
        },
        include: { _count: { select: { products: true } } },
      });
    });
  },

  async updateCategory(restaurantId: number, id: number, input: Partial<CategoryInput>) {
    return prisma.$transaction(async (tx) => {
      const category = await tx.category.findFirst({ where: { id, restaurantId, deletedAt: null } });
      if (!category) {
        throw HttpError.notFound('That category does not exist.');
      }

      if (input.parentId !== undefined && input.parentId !== null) {
        if (input.parentId === id) {
          throw HttpError.validation({ parentId: ['A category cannot be its own parent.'] });
        }

        const parent = await tx.category.findFirst({
          where: { id: input.parentId, restaurantId, deletedAt: null },
        });
        if (!parent) {
          throw HttpError.validation({ parentId: ['That parent category does not exist.'] });
        }
      }

      const slug =
        input.name !== undefined && input.name !== category.name
          ? await uniqueCategorySlug(tx, restaurantId, input.name, id)
          : undefined;

      return tx.category.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(slug ? { slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        },
        include: { _count: { select: { products: true } } },
      });
    });
  },

  async deleteCategory(restaurantId: number, id: number) {
    const category = await prisma.category.findFirst({ where: { id, restaurantId, deletedAt: null } });
    if (!category) {
      throw HttpError.notFound('That category does not exist.');
    }

    const activeProducts = await prisma.product.count({
      where: { categoryId: id, deletedAt: null },
    });
    if (activeProducts > 0) {
      throw HttpError.conflict(
        `This category has ${activeProducts} item(s) in it. Move or remove them first.`,
      );
    }

    const activeChildren = await prisma.category.count({
      where: { parentId: id, deletedAt: null },
    });
    if (activeChildren > 0) {
      throw HttpError.conflict(
        `This category has ${activeChildren} subcategory(ies). Remove them first.`,
      );
    }

    await prisma.category.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  },

  // ---------------------------------------------------------------- products

  async listProducts(
    restaurantId: number,
    filters: { categoryId?: number; search?: string; isAvailable?: boolean },
  ) {
    return prisma.product.findMany({
      where: {
        restaurantId,
        deletedAt: null,
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.isAvailable !== undefined ? { isAvailable: filters.isAvailable } : {}),
        ...(filters.search ? { name: { contains: filters.search, mode: 'insensitive' } } : {}),
      },
      include: productInclude,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  },

  async getProduct(restaurantId: number, id: number) {
    const product = await prisma.product.findFirst({
      where: { id, restaurantId, deletedAt: null },
      include: productInclude,
    });
    if (!product) {
      throw HttpError.notFound('That item does not exist.');
    }
    return product;
  },

  async createProduct(restaurantId: number, input: ProductInput) {
    return prisma.$transaction(async (tx) => {
      const category = await tx.category.findFirst({
        where: { id: input.categoryId, restaurantId, deletedAt: null },
      });
      if (!category) {
        throw HttpError.validation({ categoryId: ['That category does not exist.'] });
      }

      const groupIds = input.modifierGroupIds ?? [];
      if (groupIds.length > 0) {
        const count = await tx.modifierGroup.count({ where: { id: { in: groupIds }, restaurantId } });
        if (count !== groupIds.length) {
          throw HttpError.validation({ modifierGroupIds: ['One of those modifier groups does not exist.'] });
        }
      }

      const slug = await uniqueProductSlug(tx, restaurantId, input.name);

      return tx.product.create({
        data: {
          restaurantId,
          categoryId: input.categoryId,
          name: input.name,
          slug,
          description: input.description ?? null,
          imageUrl: input.imageUrl ?? null,
          basePrice: new Prisma.Decimal(input.basePrice),
          preparationMinutes: input.preparationMinutes ?? 10,
          tracksInventory: input.tracksInventory ?? false,
          isAvailable: input.isAvailable ?? true,
          isFeatured: input.isFeatured ?? false,
          sortOrder: input.sortOrder ?? 0,
          variants:
            input.variants && input.variants.length > 0
              ? {
                  create: input.variants.map((variant, index) => ({
                    name: variant.name,
                    priceDelta: new Prisma.Decimal(variant.priceDelta ?? 0),
                    isDefault: variant.isDefault ?? false,
                    sortOrder: variant.sortOrder ?? index,
                  })),
                }
              : undefined,
          modifierGroups:
            groupIds.length > 0 ? { create: groupIds.map((modifierGroupId) => ({ modifierGroupId })) } : undefined,
        },
        include: productInclude,
      });
    });
  },

  async updateProduct(restaurantId: number, id: number, input: Partial<ProductInput>) {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id, restaurantId, deletedAt: null },
        include: { variants: true },
      });
      if (!product) {
        throw HttpError.notFound('That item does not exist.');
      }

      if (input.categoryId !== undefined) {
        const category = await tx.category.findFirst({
          where: { id: input.categoryId, restaurantId, deletedAt: null },
        });
        if (!category) {
          throw HttpError.validation({ categoryId: ['That category does not exist.'] });
        }
      }

      if (input.modifierGroupIds !== undefined && input.modifierGroupIds.length > 0) {
        const count = await tx.modifierGroup.count({
          where: { id: { in: input.modifierGroupIds }, restaurantId },
        });
        if (count !== input.modifierGroupIds.length) {
          throw HttpError.validation({ modifierGroupIds: ['One of those modifier groups does not exist.'] });
        }
      }

      const slug =
        input.name !== undefined && input.name !== product.name
          ? await uniqueProductSlug(tx, restaurantId, input.name, id)
          : undefined;

      await tx.product.update({
        where: { id },
        data: {
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(slug ? { slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
          ...(input.basePrice !== undefined ? { basePrice: new Prisma.Decimal(input.basePrice) } : {}),
          ...(input.preparationMinutes !== undefined ? { preparationMinutes: input.preparationMinutes } : {}),
          ...(input.tracksInventory !== undefined ? { tracksInventory: input.tracksInventory } : {}),
          ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
          ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
      });

      if (input.variants !== undefined) {
        const existingIds = new Set(product.variants.map((variant) => variant.id));
        for (const variant of input.variants) {
          if (variant.id && !existingIds.has(variant.id)) {
            throw HttpError.validation({ variants: ['One of those variants does not belong to this item.'] });
          }
        }

        const keepIds = input.variants.filter((variant) => variant.id).map((variant) => variant.id!);
        await tx.productVariant.deleteMany({
          where: { productId: id, id: { notIn: keepIds.length > 0 ? keepIds : [-1] } },
        });

        for (const [index, variant] of input.variants.entries()) {
          const data = {
            name: variant.name,
            priceDelta: new Prisma.Decimal(variant.priceDelta ?? 0),
            isDefault: variant.isDefault ?? false,
            sortOrder: variant.sortOrder ?? index,
          };

          if (variant.id) {
            // eslint-disable-next-line no-await-in-loop
            await tx.productVariant.update({ where: { id: variant.id }, data });
          } else {
            // eslint-disable-next-line no-await-in-loop
            await tx.productVariant.create({ data: { ...data, productId: id } });
          }
        }
      }

      if (input.modifierGroupIds !== undefined) {
        await tx.productModifierGroup.deleteMany({ where: { productId: id } });
        if (input.modifierGroupIds.length > 0) {
          await tx.productModifierGroup.createMany({
            data: input.modifierGroupIds.map((modifierGroupId) => ({ productId: id, modifierGroupId })),
          });
        }
      }

      return tx.product.findFirst({ where: { id }, include: productInclude });
    });
  },

  async deleteProduct(restaurantId: number, id: number) {
    const product = await prisma.product.findFirst({ where: { id, restaurantId, deletedAt: null } });
    if (!product) {
      throw HttpError.notFound('That item does not exist.');
    }

    // Soft delete: past order items keep their own copy of the name and price,
    // so history reads correctly even after the dish is retired.
    await prisma.product.update({ where: { id }, data: { deletedAt: new Date(), isAvailable: false } });
  },

  // --------------------------------------------------------- modifier groups

  async listModifierGroups(restaurantId: number) {
    return prisma.modifierGroup.findMany({
      where: { restaurantId },
      include: { modifiers: { orderBy: { sortOrder: 'asc' } }, _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
  },

  async createModifierGroup(restaurantId: number, input: ModifierGroupInput) {
    return prisma.modifierGroup.create({
      data: {
        restaurantId,
        name: input.name,
        selectionType: input.selectionType ?? 'single',
        minSelections: input.minSelections ?? 0,
        maxSelections: input.maxSelections ?? 1,
        isRequired: input.isRequired ?? false,
        modifiers:
          input.modifiers && input.modifiers.length > 0
            ? {
                create: input.modifiers.map((modifier, index) => ({
                  name: modifier.name,
                  priceDelta: new Prisma.Decimal(modifier.priceDelta ?? 0),
                  isAvailable: modifier.isAvailable ?? true,
                  sortOrder: modifier.sortOrder ?? index,
                })),
              }
            : undefined,
      },
      include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
    });
  },

  async updateModifierGroup(restaurantId: number, id: number, input: Partial<ModifierGroupInput>) {
    return prisma.$transaction(async (tx) => {
      const group = await tx.modifierGroup.findFirst({
        where: { id, restaurantId },
        include: { modifiers: true },
      });
      if (!group) {
        throw HttpError.notFound('That modifier group does not exist.');
      }

      await tx.modifierGroup.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.selectionType !== undefined ? { selectionType: input.selectionType } : {}),
          ...(input.minSelections !== undefined ? { minSelections: input.minSelections } : {}),
          ...(input.maxSelections !== undefined ? { maxSelections: input.maxSelections } : {}),
          ...(input.isRequired !== undefined ? { isRequired: input.isRequired } : {}),
        },
      });

      if (input.modifiers !== undefined) {
        const existingIds = new Set(group.modifiers.map((modifier) => modifier.id));
        for (const modifier of input.modifiers) {
          if (modifier.id && !existingIds.has(modifier.id)) {
            throw HttpError.validation({ modifiers: ['One of those modifiers does not belong to this group.'] });
          }
        }

        const keepIds = input.modifiers.filter((modifier) => modifier.id).map((modifier) => modifier.id!);
        await tx.modifier.deleteMany({
          where: { modifierGroupId: id, id: { notIn: keepIds.length > 0 ? keepIds : [-1] } },
        });

        for (const [index, modifier] of input.modifiers.entries()) {
          const data = {
            name: modifier.name,
            priceDelta: new Prisma.Decimal(modifier.priceDelta ?? 0),
            isAvailable: modifier.isAvailable ?? true,
            sortOrder: modifier.sortOrder ?? index,
          };

          if (modifier.id) {
            // eslint-disable-next-line no-await-in-loop
            await tx.modifier.update({ where: { id: modifier.id }, data });
          } else {
            // eslint-disable-next-line no-await-in-loop
            await tx.modifier.create({ data: { ...data, modifierGroupId: id } });
          }
        }
      }

      return tx.modifierGroup.findFirst({
        where: { id },
        include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  },

  async deleteModifierGroup(restaurantId: number, id: number) {
    const group = await prisma.modifierGroup.findFirst({ where: { id, restaurantId } });
    if (!group) {
      throw HttpError.notFound('That modifier group does not exist.');
    }

    // A hard delete, unlike products and categories: modifier groups carry no
    // money history of their own. Past order items keep modifierSummary as a
    // plain string, not a reference to this row, so removing it here does not
    // touch anything already billed.
    await prisma.modifierGroup.delete({ where: { id } });
  },
};

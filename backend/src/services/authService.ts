import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { HttpError } from '../utils/apiResponse';
import { randomToken, slugify } from '../utils/documentNumber';

/**
 * Authentication, and the registration that creates a tenant from nothing.
 */

export interface LoginInput {
  email: string;
  password: string;
  restaurantSlug?: string;
}

export interface RegisterRestaurantInput {
  restaurantName: string;
  ownerName: string;
  email: string;
  phone: string;
  password: string;
  city?: string;
  addressLine?: string;
  branchName?: string;
}

export interface AdminCreateRestaurantInput extends RegisterRestaurantInput {
  commissionType: 'percentage' | 'fixed';
  commissionValue: number;
}

type CommercialTerms = ReturnType<typeof currentPlatformTerms>;

/**
 * The commercial terms a restaurant registering right now would be signed up
 * on. Read from config so the figure shown on the registration screen is the
 * same one applied a moment later.
 */
export function currentPlatformTerms() {
  return {
    commissionType: env.platform.commissionType,
    commissionValue: env.platform.commissionValue,
    settlementFrequency: env.platform.settlementFrequency,
    currencyCode: env.platform.currency,
  };
}

function issueToken(userId: number, restaurantId: number | null, branchId: number | null): string {
  return jwt.sign({ sub: userId, restaurantId, branchId }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  } as jwt.SignOptions);
}

export const authService = {
  async login(input: LoginInput, ip?: string) {
    // Email is unique per tenant, so the same address can exist at two
    // restaurants. Without a slug we take the first match, which is correct
    // for the overwhelmingly common case of one account per person.
    const user = await prisma.user.findFirst({
      where: {
        email: input.email.toLowerCase().trim(),
        deletedAt: null,
        ...(input.restaurantSlug ? { restaurant: { slug: input.restaurantSlug } } : {}),
      },
      include: {
        restaurant: { select: { id: true, name: true, slug: true, status: true } },
        branch: { select: { id: true, name: true, code: true } },
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });

    // The same message whether the email is unknown or the password is wrong.
    // Distinguishing them turns the login form into a way to discover who has
    // an account here.
    const genericFailure = HttpError.unauthorised('Those details do not match an account.');

    if (!user) {
      // Still spend the time a real comparison would, so response timing does
      // not reveal whether the address exists.
      await bcrypt.compare(input.password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv');
      throw genericFailure;
    }

    if (!(await bcrypt.compare(input.password, user.password))) {
      throw genericFailure;
    }

    if (user.status === 'suspended') {
      throw HttpError.forbidden('This account has been suspended.');
    }

    if (user.restaurant && user.restaurant.status === 'suspended') {
      throw HttpError.forbidden('This restaurant has been suspended. Contact the platform.');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ip ?? null },
    });

    return {
      token: issueToken(user.id, user.restaurantId, user.branchId),
      user: serialiseUser(user),
    };
  },

  /**
   * Registration creates a working tenant from nothing. Commission is fixed
   * here, from config - a restaurant does not name its own rate, and a value
   * sent by a client is not read.
   */
  async registerRestaurant(input: RegisterRestaurantInput) {
    const terms = currentPlatformTerms();
    const { owner, restaurant } = await provisionRestaurant(input, terms);

    return {
      token: issueToken(owner.id, restaurant.id, null),
      user: serialiseUser(owner),
      restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug, status: restaurant.status },
      // Echoed back so the restaurant has a record of exactly what it agreed
      // to, in the same response that created the account.
      agreedTerms: {
        commissionType: restaurant.commissionType,
        commissionValue: Number(restaurant.commissionValue),
        settlementFrequency: restaurant.settlementFrequency,
        agreedAt: restaurant.termsAgreedAt,
      },
    };
  },

  /**
   * The same onboarding as registerRestaurant, used from the Super Admin
   * console instead of the public form. The one real difference is that the
   * admin chooses the commission terms - restaurants do not choose their own.
   *
   * No token is issued: the admin stays signed in as themselves, they are not
   * logging in as the restaurant they just created.
   */
  async createRestaurantForAdmin(input: AdminCreateRestaurantInput) {
    const terms: CommercialTerms = {
      commissionType: input.commissionType,
      commissionValue: input.commissionValue,
      settlementFrequency: env.platform.settlementFrequency,
      currencyCode: env.platform.currency,
    };

    const { owner, restaurant } = await provisionRestaurant(input, terms);

    return {
      user: serialiseUser(owner),
      restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug, status: restaurant.status },
      agreedTerms: {
        commissionType: restaurant.commissionType,
        commissionValue: Number(restaurant.commissionValue),
        settlementFrequency: restaurant.settlementFrequency,
        agreedAt: restaurant.termsAgreedAt,
      },
    };
  },
};

/**
 * The onboarding transaction shared by the public registration form and the
 * Super Admin's "add restaurant": the restaurant, its first branch, the
 * owner account, a starter menu structure and the public website record.
 *
 * Registration writes seven rows in sequence. Prisma's 5s default
 * interactive-transaction budget is tight enough that Neon's free-tier
 * cold-start latency can blow through it on the first request of the day,
 * so it is extended here.
 */
async function provisionRestaurant(input: RegisterRestaurantInput, terms: CommercialTerms) {
  const email = input.email.toLowerCase().trim();

  // Email is unique per tenant, not globally, so the same address can
  // legitimately own two different restaurants - but that has to be a
  // deliberate second registration, not this form silently accepted twice.
  const existingOwner = await prisma.user.findFirst({
    where: { email, deletedAt: null, roles: { some: { role: { slug: 'restaurant_owner' } } } },
  });

  if (existingOwner) {
    throw HttpError.conflict(
      'An account with this email already owns a restaurant. Sign in instead, or use a different email.',
    );
  }

  return prisma.$transaction(async (tx) => {
    const slug = await uniqueRestaurantSlug(tx, input.restaurantName);

    const restaurant = await tx.restaurant.create({
      data: {
        name: input.restaurantName.trim(),
        slug,
        contactEmail: email,
        contactPhone: input.phone.trim(),
        addressLine: input.addressLine?.trim() || null,
        city: input.city?.trim() || null,
        currencyCode: terms.currencyCode,

        commissionType: terms.commissionType,
        commissionValue: terms.commissionValue,
        settlementFrequency: terms.settlementFrequency,
        termsAgreedAt: new Date(),

        status: env.platform.autoActivate ? 'active' : 'pending',
      },
    });

    const branch = await tx.branch.create({
      data: {
        restaurantId: restaurant.id,
        name: input.branchName?.trim() || 'Main Branch',
        code: `${slug.slice(0, 3).toUpperCase()}-01`,
        addressLine: input.addressLine?.trim() || null,
        city: input.city?.trim() || null,
        phone: input.phone.trim(),
        status: 'active',
      },
    });

    const ownerRole = await tx.role.findFirst({
      where: { slug: 'restaurant_owner', restaurantId: null },
    });

    if (!ownerRole) {
      throw new Error('System roles are missing. Run the seeder before registering.');
    }

    const owner = await tx.user.create({
      data: {
        restaurantId: restaurant.id,
        branchId: null, // an owner is unbound: every branch is theirs
        fullName: input.ownerName.trim(),
        email,
        phone: input.phone.trim(),
        password: await bcrypt.hash(input.password, 12),
        status: 'active',
        roles: { create: { roleId: ownerRole.id } },
      },
      include: {
        restaurant: { select: { id: true, name: true, slug: true, status: true } },
        branch: { select: { id: true, name: true, code: true } },
        roles: {
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        },
      },
    });

    // A website record from day one, unpublished. The owner edits its theme
    // and publishes when ready, rather than having to create it first.
    await tx.restaurantWebsite.create({
      data: { restaurantId: restaurant.id, isPublished: false },
    });

    // Cash always works. Without at least one payment method a cashier
    // cannot close a single bill.
    await tx.paymentMethod.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Cash',
        code: 'cash',
        kind: 'cash',
        sortOrder: 0,
      },
    });

    await tx.category.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Main Menu',
        slug: 'main-menu',
        sortOrder: 0,
      },
    });

    await tx.kitchenStation.create({
      data: { restaurantId: restaurant.id, branchId: branch.id, name: 'Main Kitchen' },
    });

    return { owner, restaurant };
  }, { timeout: 15_000 });
}

async function uniqueRestaurantSlug(
  tx: { restaurant: { findUnique: (args: never) => Promise<unknown> } },
  name: string,
): Promise<string> {
  const base = slugify(name) || `restaurant-${randomToken(6).toLowerCase()}`;
  let candidate = base;
  let suffix = 1;

  // eslint-disable-next-line no-await-in-loop
  while (await tx.restaurant.findUnique({ where: { slug: candidate } } as never)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  return candidate;
}

type UserWithRelations = {
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  avatarPath: string | null;
  restaurantId: number | null;
  branchId: number | null;
  restaurant: { id: number; name: string; slug?: string; status: string } | null;
  branch: { id: number; name: string; code: string } | null;
  roles: { role: { slug: string; name: string; permissions: { permission: { slug: string } }[] } }[];
};

export function serialiseUser(user: UserWithRelations) {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    avatarPath: user.avatarPath,
    primaryRole: user.roles[0]?.role.slug ?? 'unknown',
    roleName: user.roles[0]?.role.name ?? 'Unknown',
    scope: {
      isPlatformAdmin: user.restaurantId === null,
      restaurantId: user.restaurantId,
      restaurantName: user.restaurant?.name ?? null,
      restaurantSlug: user.restaurant?.slug ?? null,
      branchId: user.branchId,
      branchName: user.branch?.name ?? null,
    },
    permissions: [
      ...new Set(
        user.roles.flatMap((assignment) =>
          assignment.role.permissions.map((link) => link.permission.slug),
        ),
      ),
    ],
  };
}

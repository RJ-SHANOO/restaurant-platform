import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma';
import { HttpError } from '../utils/apiResponse';

/**
 * Staff accounts and the roles they can be given.
 *
 * User is deliberately not one of the tenant-scoped models in config/prisma.ts
 * (login has to find a user before a tenant is known), so every query here
 * filters by restaurantId itself instead of relying on req.db to do it.
 */

export interface CreateStaffInput {
  fullName: string;
  email: string;
  phone?: string | null;
  password: string;
  roleId: number;
  branchId?: number | null;
}

export interface UpdateStaffInput {
  fullName?: string;
  email?: string;
  phone?: string | null;
  roleId?: number;
  branchId?: number | null;
  status?: 'active' | 'suspended';
}

async function assertRoleUsable(restaurantId: number, roleId: number) {
  const role = await prisma.role.findFirst({
    where: { id: roleId, OR: [{ restaurantId: null }, { restaurantId }], slug: { not: 'super_admin' } },
  });

  if (!role) {
    throw HttpError.validation({ roleId: ['That role is not available.'] });
  }

  return role;
}

async function assertBranchInTenant(restaurantId: number, branchId: number) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, restaurantId } });

  if (!branch) {
    throw HttpError.validation({ branchId: ['That branch is not part of this restaurant.'] });
  }
}

export const staffService = {
  async list(restaurantId: number) {
    return prisma.user.findMany({
      where: { restaurantId, deletedAt: null },
      include: {
        branch: { select: { id: true, name: true } },
        roles: { include: { role: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  },

  async listRoles(restaurantId: number) {
    return prisma.role.findMany({
      where: { OR: [{ restaurantId: null }, { restaurantId }], slug: { not: 'super_admin' } },
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
  },

  async create(restaurantId: number, input: CreateStaffInput) {
    const email = input.email.toLowerCase().trim();

    const existing = await prisma.user.findFirst({ where: { restaurantId, email, deletedAt: null } });

    if (existing) {
      throw HttpError.validation({ email: ['A staff account with this email already exists.'] });
    }

    await assertRoleUsable(restaurantId, input.roleId);

    if (input.branchId) {
      await assertBranchInTenant(restaurantId, input.branchId);
    }

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          restaurantId,
          branchId: input.branchId ?? null,
          fullName: input.fullName.trim(),
          email,
          phone: input.phone?.trim() || null,
          password: await bcrypt.hash(input.password, 12),
          status: 'active',
          roles: { create: { roleId: input.roleId } },
        },
        include: {
          branch: { select: { id: true, name: true } },
          roles: { include: { role: true } },
        },
      });

      return user;
    });
  },

  async update(restaurantId: number, id: number, input: UpdateStaffInput) {
    const user = await prisma.user.findFirst({ where: { id, restaurantId, deletedAt: null } });

    if (!user) {
      throw HttpError.notFound('That staff member does not exist.');
    }

    if (input.email) {
      const email = input.email.toLowerCase().trim();
      const existing = await prisma.user.findFirst({
        where: { restaurantId, email, deletedAt: null, id: { not: id } },
      });

      if (existing) {
        throw HttpError.validation({ email: ['A staff account with this email already exists.'] });
      }
    }

    if (input.roleId) {
      await assertRoleUsable(restaurantId, input.roleId);
    }

    if (input.branchId) {
      await assertBranchInTenant(restaurantId, input.branchId);
    }

    return prisma.$transaction(async (tx) => {
      if (input.roleId) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.create({ data: { userId: id, roleId: input.roleId } });
      }

      return tx.user.update({
        where: { id },
        data: {
          fullName: input.fullName?.trim(),
          email: input.email?.toLowerCase().trim(),
          phone: input.phone === undefined ? undefined : input.phone?.trim() || null,
          branchId: input.branchId === undefined ? undefined : input.branchId,
          status: input.status,
        },
        include: {
          branch: { select: { id: true, name: true } },
          roles: { include: { role: true } },
        },
      });
    });
  },

  async remove(restaurantId: number, id: number, actingUserId: number) {
    if (id === actingUserId) {
      throw HttpError.conflict('You cannot remove your own account.');
    }

    const user = await prisma.user.findFirst({ where: { id, restaurantId, deletedAt: null } });

    if (!user) {
      throw HttpError.notFound('That staff member does not exist.');
    }

    // Soft delete: past orders and audit entries keep pointing at this row.
    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'suspended' },
    });
  },
};

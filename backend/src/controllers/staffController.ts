import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { apiResponse } from '../utils/apiResponse';
import { staffService } from '../services/staffService';

const staffSchema = z.object({
  fullName: z.string().min(2).max(150),
  email: z.string().email().max(150),
  phone: z.string().max(30).optional().nullable(),
  password: z.string().min(8).max(100),
  roleId: z.number().int().positive(),
  branchId: z.number().int().positive().optional().nullable(),
});

const staffUpdateSchema = staffSchema.omit({ password: true }).partial().extend({
  status: z.enum(['active', 'suspended']).optional(),
});

export const staffController = {
  async index(req: Request, res: Response, next: NextFunction) {
    try {
      const staff = await staffService.list(req.tenantId!);
      return apiResponse.success(res, staff.map(serialiseStaff));
    } catch (error) {
      next(error);
    }
  },

  async roles(req: Request, res: Response, next: NextFunction) {
    try {
      const roles = await staffService.listRoles(req.tenantId!);
      return apiResponse.success(res, roles.map(serialiseRole));
    } catch (error) {
      next(error);
    }
  },

  async store(req: Request, res: Response, next: NextFunction) {
    try {
      const input = staffSchema.parse(req.body);
      const user = await staffService.create(req.tenantId!, input);
      return apiResponse.created(res, serialiseStaff(user), `${user.fullName} added.`);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      const input = staffUpdateSchema.parse(req.body);
      const user = await staffService.update(req.tenantId!, id, input);
      return apiResponse.success(res, serialiseStaff(user), 'Staff member updated.');
    } catch (error) {
      next(error);
    }
  },

  async destroy(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id);
      await staffService.remove(req.tenantId!, id, req.actor!.id);
      return apiResponse.noContent(res, 'Staff member removed.');
    } catch (error) {
      next(error);
    }
  },
};

function serialiseStaff(user: Record<string, unknown>) {
  const branch = user.branch as { id: number; name: string } | null;
  const roles = user.roles as { role: { slug: string; name: string } }[];

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    status: user.status,
    branch: branch ? { id: branch.id, name: branch.name } : null,
    role: roles[0] ? { slug: roles[0].role.slug, name: roles[0].role.name } : null,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

function serialiseRole(role: Record<string, unknown>) {
  const permissions = role.permissions as { permission: { slug: string; name: string; groupName: string } }[];

  return {
    id: role.id,
    slug: role.slug,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: permissions.map((link) => link.permission.slug),
  };
}

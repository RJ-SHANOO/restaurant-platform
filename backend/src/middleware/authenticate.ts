import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma, tenantClient } from '../config/prisma';
import { HttpError } from '../utils/apiResponse';

interface TokenPayload {
  sub: number;
  restaurantId: number | null;
  branchId: number | null;
}

/**
 * Verifies the bearer token and builds the request's tenant context.
 *
 * The tenant is read from the *user record*, never from the request. A client
 * can send restaurantId in a body, a query string or a header; none of it is
 * consulted here. The single exception is X-View-Restaurant-Id, honoured only
 * for platform administrators, which is how the Super Admin drills into a
 * tenant without a second login.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw HttpError.unauthorised();
    }

    let payload: TokenPayload;

    try {
      payload = jwt.verify(header.slice(7), env.jwt.secret) as unknown as TokenPayload;
    } catch {
      throw HttpError.unauthorised('Your session has expired. Please sign in again.');
    }

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      include: {
        restaurant: { select: { id: true, name: true, status: true } },
        branch: { select: { id: true, name: true, code: true } },
        roles: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });

    if (!user) {
      throw HttpError.unauthorised('This account no longer exists.');
    }

    if (user.status === 'suspended') {
      throw HttpError.forbidden('This account has been suspended.');
    }

    // A suspended restaurant locks out its whole team, not just its owner.
    if (user.restaurant && user.restaurant.status === 'suspended') {
      throw HttpError.forbidden('This restaurant has been suspended. Contact the platform.');
    }

    const permissions = [
      ...new Set(
        user.roles.flatMap((assignment) =>
          assignment.role.permissions.map((link) => link.permission.slug),
        ),
      ),
    ];

    const isPlatformAdmin = user.restaurantId === null;

    req.actor = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      restaurantId: user.restaurantId,
      branchId: user.branchId,
      isPlatformAdmin,
      primaryRole: user.roles[0]?.role.slug ?? 'unknown',
      permissions,
    };

    // Platform admins may scope a request to one tenant. Everyone else is
    // pinned to their own, whatever the header says.
    const requestedTenant = Number(req.headers['x-view-restaurant-id']);

    req.tenantId = isPlatformAdmin
      ? Number.isFinite(requestedTenant) && requestedTenant > 0
        ? requestedTenant
        : undefined
      : (user.restaurantId ?? undefined);

    if (req.tenantId) {
      req.db = tenantClient(req.tenantId);
    }

    next();
  } catch (error) {
    next(error);
  }
}

/** Requires a tenant context. Use on any route that reads restaurant data. */
export function requireTenant(req: Request, _res: Response, next: NextFunction) {
  if (!req.tenantId || !req.db) {
    return next(
      HttpError.badRequest(
        'This request needs a restaurant. Platform administrators must send X-View-Restaurant-Id.',
      ),
    );
  }

  next();
}

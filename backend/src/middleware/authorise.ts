import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/apiResponse';

/**
 * Permission and role gates.
 *
 * The frontend hides controls a user cannot use, but that is convenience, not
 * security. Every permission is re-checked here on every request: a hidden
 * button is not a locked door.
 */

export function requirePermission(...slugs: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.actor) {
      return next(HttpError.unauthorised());
    }

    // Platform administrators hold every permission implicitly.
    if (req.actor.isPlatformAdmin) {
      return next();
    }

    const granted = slugs.some((slug) => req.actor!.permissions.includes(slug));

    if (!granted) {
      return next(
        HttpError.forbidden(
          `Your role does not include ${slugs.length > 1 ? 'any of ' : ''}${slugs.join(' or ')}.`,
        ),
      );
    }

    next();
  };
}

export function requireRole(...slugs: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.actor) {
      return next(HttpError.unauthorised());
    }

    if (!slugs.includes(req.actor.primaryRole)) {
      return next(HttpError.forbidden('This area is not available to your role.'));
    }

    next();
  };
}

export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.actor?.isPlatformAdmin) {
    return next(HttpError.forbidden('This area is for platform administrators.'));
  }

  next();
}

/**
 * A branch-bound user (a cashier, a branch manager) may only touch their own
 * branch. An owner has branchId null and sees every branch in the restaurant.
 *
 * Called from controllers rather than mounted as middleware, because the branch
 * being acted on is usually inside the body or the record, not the URL.
 */
export function assertBranchAccess(req: Request, branchId: number): void {
  const actor = req.actor;

  if (!actor) {
    throw HttpError.unauthorised();
  }

  if (actor.isPlatformAdmin || actor.branchId === null) {
    return;
  }

  if (actor.branchId !== branchId) {
    throw HttpError.forbidden('That branch is not yours.');
  }
}

/**
 * The branch a branch-scoped endpoint (Mezbaan settings, payment methods)
 * operates on: a branch-bound user's own branch, or - for an owner, whose
 * branchId is null because they see every branch - whichever branch they
 * asked for via ?branchId=. Either way assertBranchAccess still gets the
 * final say, so a branch-bound user cannot override their own branch by
 * passing a different one in the query string.
 */
export function resolveBranchId(req: Request): number {
  const actor = req.actor;

  if (!actor) {
    throw HttpError.unauthorised();
  }

  const queried = typeof req.query.branchId === 'string' ? Number(req.query.branchId) : undefined;
  const branchId = actor.branchId ?? queried;

  if (!branchId || Number.isNaN(branchId)) {
    throw HttpError.validation({
      branchId: ['Pass a branchId - your account is not bound to a single branch.'],
    });
  }

  assertBranchAccess(req, branchId);
  return branchId;
}

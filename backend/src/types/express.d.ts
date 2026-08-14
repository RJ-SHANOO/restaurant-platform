import type { TenantClient } from '../config/prisma';

/**
 * What authentication attaches to a request.
 *
 * `db` is the important field: it is a Prisma client already bound to this
 * user's restaurant. Controllers use req.db, never the bare prisma import, and
 * tenant isolation follows automatically.
 */
export interface AuthenticatedActor {
  id: number;
  fullName: string;
  email: string;
  restaurantId: number | null;
  branchId: number | null;
  isPlatformAdmin: boolean;
  primaryRole: string;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      actor?: AuthenticatedActor;
      db?: TenantClient;
      /** The restaurant this request operates on. Differs from actor.restaurantId
       *  only when a platform admin is drilling into a tenant. */
      tenantId?: number;
    }
  }
}

export {};

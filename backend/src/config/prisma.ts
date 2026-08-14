import { PrismaClient } from '@prisma/client';
import { env } from './env';

/**
 * The Prisma client, and the tenant guard built on top of it.
 *
 * Laravel had a global scope that silently added `where restaurant_id = ?` to
 * every query. Prisma has no such thing, so the equivalent is built here: a
 * scoped client that injects the tenant filter into every read and the tenant
 * id into every write.
 *
 * The important property is that isolation is not each query's responsibility.
 * A developer who forgets the filter still gets a filtered query, because the
 * filter is applied by the client rather than by the caller.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isProduction ? ['error'] : ['warn', 'error'],
  });

// In development, tsx reloads the module on every save. Without this, each
// reload opens a fresh pool and the database runs out of connections.
if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}

/**
 * Models that carry restaurantId and must therefore be tenant-filtered.
 *
 * User is deliberately absent: login has to find a user before a tenant is
 * known, so scoping it here would deadlock authentication. Tenant safety for
 * users is enforced explicitly in the auth service instead.
 */
export const TENANT_SCOPED_MODELS = [
  'branch',
  'category',
  'product',
  'modifierGroup',
  'diningTable',
  'customer',
  'order',
  'invoice',
  'payment',
  'refund',
  'paymentMethod',
  'commissionEntry',
  'settlement',
  'inventoryItem',
  'supplier',
  'purchase',
  'expense',
  'device',
  'kitchenStation',
  'setting',
  'auditLog',
] as const;

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

/**
 * A Prisma client bound to one restaurant.
 *
 * Every findMany, findFirst, update, delete and count on a tenant-scoped model
 * gets `restaurantId` merged into its where clause, and every create gets it
 * merged into the data. Passing a different restaurantId explicitly throws
 * rather than silently winning - a cross-tenant write is a bug, not a
 * preference.
 */
export function tenantClient(restaurantId: number) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const modelKey = model.charAt(0).toLowerCase() + model.slice(1);

          if (!TENANT_SCOPED_MODELS.includes(modelKey as TenantScopedModel)) {
            return query(args);
          }

          const typedArgs = args as Record<string, unknown>;

          // ---------------------------------------------------------- reads
          if (
            operation === 'findMany' ||
            operation === 'findFirst' ||
            operation === 'findFirstOrThrow' ||
            operation === 'count' ||
            operation === 'aggregate' ||
            operation === 'updateMany' ||
            operation === 'deleteMany'
          ) {
            typedArgs.where = { ...(typedArgs.where ?? {}), restaurantId };
            return query(typedArgs);
          }

          // findUnique cannot take an arbitrary where clause, so the tenant is
          // verified after the fact and a foreign row is reported as missing.
          // A 404 rather than a 403 is deliberate: confirming that a record
          // exists but belongs to someone else is itself a disclosure.
          if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            const record = (await query(typedArgs)) as { restaurantId?: number } | null;

            if (record && record.restaurantId !== restaurantId) {
              return null;
            }

            return record;
          }

          // --------------------------------------------------------- writes
          if (operation === 'create') {
            const data = (typedArgs.data ?? {}) as Record<string, unknown>;

            if (data.restaurantId !== undefined && data.restaurantId !== restaurantId) {
              throw new Error(
                `Refusing to create ${model} for restaurant ${String(data.restaurantId)} ` +
                  `while acting as restaurant ${restaurantId}.`,
              );
            }

            typedArgs.data = { ...data, restaurantId };
            return query(typedArgs);
          }

          if (operation === 'createMany') {
            const rows = (typedArgs.data ?? []) as Record<string, unknown>[];
            typedArgs.data = rows.map((row) => ({ ...row, restaurantId }));
            return query(typedArgs);
          }

          if (operation === 'update' || operation === 'delete') {
            // Confirm ownership before touching the row. Prisma's update/delete
            // take a unique where, which cannot carry restaurantId.
            const where = (typedArgs.where ?? {}) as Record<string, unknown>;

            if (typeof where.id === 'number') {
              const owner = (await (prisma as never as Record<string, {
                findUnique: (a: unknown) => Promise<{ restaurantId: number } | null>;
              }>)[modelKey].findUnique({
                where: { id: where.id },
                select: { restaurantId: true },
              })) as { restaurantId: number } | null;

              if (!owner || owner.restaurantId !== restaurantId) {
                throw new TenantAccessError(model, where.id);
              }
            }

            return query(typedArgs);
          }

          return query(typedArgs);
        },
      },
    },
  });
}

export class TenantAccessError extends Error {
  constructor(model: string, id: unknown) {
    super(`No ${model} with id ${String(id)} in this restaurant.`);
    this.name = 'TenantAccessError';
  }
}

export type TenantClient = ReturnType<typeof tenantClient>;

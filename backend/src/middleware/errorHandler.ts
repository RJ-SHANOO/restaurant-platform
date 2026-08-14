import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { apiResponse, HttpError } from '../utils/apiResponse';
import { TenantAccessError } from '../config/prisma';

/**
 * Every error leaves the API in the same envelope.
 *
 * Framework errors, validation failures and thrown HttpErrors all render the
 * same shape, so the frontend never has to guess what an error looks like.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof HttpError) {
    return apiResponse.error(res, error.status, error.message, error.errors);
  }

  if (error instanceof ZodError) {
    const errors: Record<string, string[]> = {};

    for (const issue of error.errors) {
      const field = issue.path.join('.') || 'value';
      errors[field] = [...(errors[field] ?? []), issue.message];
    }

    return apiResponse.error(res, 422, 'The submitted data is not valid.', errors);
  }

  // A cross-tenant reach reports as missing, not forbidden. Confirming that a
  // record exists but belongs to someone else is itself a disclosure.
  if (error instanceof TenantAccessError) {
    return apiResponse.error(res, 404, 'Not found.');
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const fields = (error.meta?.target as string[] | undefined) ?? [];

      return apiResponse.error(res, 409, 'That already exists.', {
        [fields[fields.length - 1] ?? 'value']: ['This value is already taken.'],
      });
    }

    if (error.code === 'P2025') {
      return apiResponse.error(res, 404, 'Not found.');
    }

    if (error.code === 'P2003') {
      return apiResponse.error(res, 409, 'Something else depends on this record.');
    }
  }

  // Anything unrecognised is a bug. Log it in full; tell the client nothing
  // that would help an attacker map the internals.
  console.error('[unhandled]', error);

  return apiResponse.error(
    res,
    500,
    env.isProduction
      ? 'Something went wrong on our end.'
      : error instanceof Error
        ? error.message
        : 'Unknown error.',
  );
}

export function notFoundHandler(_req: Request, res: Response) {
  return apiResponse.error(res, 404, 'That endpoint does not exist.');
}

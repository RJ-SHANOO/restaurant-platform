import type { Response } from 'express';

/**
 * One response shape for the entire API.
 *
 * Success and failure share the same envelope so the frontend has exactly one
 * parsing path and exactly one error path, rather than a special case per
 * endpoint.
 */

export interface PaginationMeta {
  currentPage: number;
  perPage: number;
  total: number;
  lastPage: number;
}

export const apiResponse = {
  success<T>(res: Response, data: T, message = 'OK', meta?: Record<string, unknown>) {
    return res.status(200).json({ success: true, message, data, meta: meta ?? {} });
  },

  created<T>(res: Response, data: T, message = 'Created.') {
    return res.status(201).json({ success: true, message, data, meta: {} });
  },

  paginated<T>(res: Response, data: T[], pagination: PaginationMeta, message = 'OK') {
    return res.status(200).json({
      success: true,
      message,
      data,
      meta: { pagination },
    });
  },

  noContent(res: Response, message = 'Done.') {
    return res.status(200).json({ success: true, message, data: null, meta: {} });
  },

  error(res: Response, status: number, message: string, errors?: Record<string, string[]>) {
    return res.status(status).json({
      success: false,
      message,
      ...(errors ? { errors } : {}),
    });
  },
};

/**
 * Thrown anywhere in a service or controller; caught by the error middleware
 * and rendered into the envelope above. Throwing beats returning an error
 * object because it cannot be accidentally ignored by the caller.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  static badRequest(message: string, errors?: Record<string, string[]>) {
    return new HttpError(400, message, errors);
  }

  static unauthorised(message = 'You are not signed in.') {
    return new HttpError(401, message);
  }

  static forbidden(message = 'You do not have permission to do that.') {
    return new HttpError(403, message);
  }

  static notFound(message = 'Not found.') {
    return new HttpError(404, message);
  }

  static conflict(message: string) {
    return new HttpError(409, message);
  }

  static validation(errors: Record<string, string[]>, message = 'The submitted data is not valid.') {
    return new HttpError(422, message, errors);
  }
}

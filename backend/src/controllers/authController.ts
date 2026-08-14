import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../config/prisma';
import { apiResponse } from '../utils/apiResponse';
import { authService, currentPlatformTerms, serialiseUser } from '../services/authService';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
  restaurantSlug: z.string().optional(),
});

const registerSchema = z.object({
  restaurantName: z.string().min(2, 'Enter the restaurant name.').max(150),
  ownerName: z.string().min(2, 'Enter your name.').max(150),
  email: z.string().email('Enter a valid email address.'),
  phone: z.string().min(7, 'Enter a contact number.').max(30),
  password: z
    .string()
    .min(8, 'Use at least 8 characters.')
    .regex(/[0-9]/, 'Include at least one number.'),
  city: z.string().max(80).optional(),
  addressLine: z.string().max(255).optional(),
  branchName: z.string().max(120).optional(),

  // The restaurant agrees to the platform's terms; it does not propose them.
  // There is deliberately no commission field - a value sent here would be
  // ignored, because the rate is read from config inside the service.
  acceptsTerms: z.literal(true, {
    errorMap: () => ({ message: 'You need to accept the commission terms to register.' }),
  }),
});

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const input = loginSchema.parse(req.body);
      const result = await authService.login(input, req.ip);

      return apiResponse.success(res, result, 'Signed in.');
    } catch (error) {
      next(error);
    }
  },

  async registerRestaurant(req: Request, res: Response, next: NextFunction) {
    try {
      const input = registerSchema.parse(req.body);
      const result = await authService.registerRestaurant(input);

      return apiResponse.created(
        res,
        result,
        result.restaurant.status === 'active'
          ? 'Restaurant registered. You can start taking orders now.'
          : 'Restaurant registered. Your account is pending platform approval.',
      );
    } catch (error) {
      next(error);
    }
  },

  /**
   * The terms a restaurant registering right now would get.
   *
   * Public and unauthenticated on purpose: the registration screen must be able
   * to show the rate before anyone has an account.
   */
  async platformTerms(_req: Request, res: Response) {
    return apiResponse.success(res, currentPlatformTerms());
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: req.actor!.id },
        include: {
          restaurant: { select: { id: true, name: true, slug: true, status: true } },
          branch: { select: { id: true, name: true, code: true } },
          roles: {
            include: { role: { include: { permissions: { include: { permission: true } } } } },
          },
        },
      });

      return apiResponse.success(res, serialiseUser(user));
    } catch (error) {
      next(error);
    }
  },

  /**
   * With stateless JWTs there is no server-side session to destroy, so this
   * exists for the client to call and for symmetry. Real revocation would need
   * a token denylist, which is a deliberate later decision rather than an
   * oversight.
   */
  async logout(_req: Request, res: Response) {
    return apiResponse.noContent(res, 'Signed out.');
  },
};

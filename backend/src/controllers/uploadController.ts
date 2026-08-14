import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { apiResponse, HttpError } from '../utils/apiResponse';
import { uploadService } from '../services/uploadService';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      callback(new Error('Only JPEG, PNG or WEBP images are accepted.'));
      return;
    }

    callback(null, true);
  },
});

/**
 * One generic endpoint for every image in the app - a product photo, a
 * restaurant logo, a website banner, a staff avatar. It only returns a URL;
 * saving that URL onto a product or a website still goes through that
 * resource's own permission-gated update endpoint.
 */
export const uploadController = {
  store(req: Request, res: Response, next: NextFunction) {
    upload.single('file')(req, res, async (error: unknown) => {
      if (error) {
        return next(HttpError.badRequest(error instanceof Error ? error.message : 'Could not read that image.'));
      }

      try {
        if (!req.file) {
          throw HttpError.badRequest('No image was sent.');
        }

        const url = await uploadService.uploadImage(req.file.buffer, `restaurants/${req.tenantId}`);

        return apiResponse.created(res, { url }, 'Image uploaded.');
      } catch (uploadError) {
        next(uploadError);
      }
    });
  },
};

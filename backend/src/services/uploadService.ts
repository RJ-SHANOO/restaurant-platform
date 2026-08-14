import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';
import { HttpError } from '../utils/apiResponse';

/**
 * Cloudinary is configured once, at module load, from the keys resolved by
 * config/env.ts. If they are missing, uploadImage fails with a message that
 * says so instead of a Cloudinary SDK error the owner cannot act on.
 */
if (env.cloudinary.isConfigured) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
  });
}

export const uploadService = {
  async uploadImage(buffer: Buffer, folder: string): Promise<string> {
    if (!env.cloudinary.isConfigured) {
      throw HttpError.badRequest(
        'Image upload is not configured. Add the Cloudinary keys to backend/.env.',
      );
    }

    return new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('The image could not be uploaded.'));
            return;
          }

          resolve(result.secure_url);
        },
      );

      stream.end(buffer);
    });
  },
};

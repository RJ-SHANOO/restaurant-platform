import dotenv from 'dotenv';

dotenv.config();

/**
 * Every environment value the application reads, resolved once at boot.
 *
 * Reading process.env directly from application code makes a missing variable
 * a runtime surprise somewhere deep in a request. Resolving it here means a
 * misconfigured deployment fails immediately, at startup, with a message that
 * names the variable.
 */

function required(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env and fill it in.`,
    );
  }

  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  isProduction: optional('NODE_ENV', 'development') === 'production',
  port: Number(optional('PORT', '8000')),
  appName: optional('APP_NAME', 'Restaurant Platform'),

  databaseUrl: required('DATABASE_URL'),

  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: optional('JWT_EXPIRES_IN', '7d'),
  },

  /**
   * Origins allowed to call this API from a browser. Comma-separated so
   * preview deployments can be added without a code change.
   */
  allowedOrigins: optional('FRONTEND_URL', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  /**
   * The commercial terms a restaurant registering right now is signed up on.
   *
   * These live in config, not in a settings table: a change is a deliberate
   * deployment rather than a form submission, and nothing with database access
   * can quietly alter them.
   *
   * Each restaurant's own rate IS stored on its row - it has to be, or a
   * negotiated deal would be impossible and changing this value would rewrite
   * what every existing restaurant already agreed to.
   */
  platform: {
    commissionType: optional('PLATFORM_COMMISSION_TYPE', 'percentage') as
      | 'percentage'
      | 'fixed',
    commissionValue: Number(optional('PLATFORM_COMMISSION_VALUE', '5.0')),
    settlementFrequency: optional('PLATFORM_SETTLEMENT_FREQUENCY', 'weekly') as
      | 'daily'
      | 'every_2_days'
      | 'weekly'
      | 'monthly',
    autoActivate: optional('PLATFORM_AUTO_ACTIVATE', 'true') === 'true',
    currency: optional('PLATFORM_CURRENCY', 'PKR'),
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
    get isConfigured(): boolean {
      return Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
          process.env.CLOUDINARY_API_KEY &&
          process.env.CLOUDINARY_API_SECRET,
      );
    },
  },
};

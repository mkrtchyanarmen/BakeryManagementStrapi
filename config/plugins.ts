import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  // Cashier app keeps the user signed in and re-validates credentials monthly.
  'users-permissions': {
    config: {
      jwt: {
        expiresIn: env('JWT_EXPIRES_IN', '30d'),
      },
    },
  },
});

export default config;

import type { Core } from '@strapi/strapi';

import { configureRolesAndPermissions } from './bootstrap/permissions';
import { ensureAppSettings } from './utils/app-settings';

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await ensureAppSettings(strapi);
    await configureRolesAndPermissions(strapi);
  },
};

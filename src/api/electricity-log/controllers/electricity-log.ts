import { factories } from '@strapi/strapi';

import {
  applyElectricityLogDefaults,
  copyElectricityComputedFields,
} from '../../../utils/electricity-log';

export default factories.createCoreController(
  'api::electricity-log.electricity-log' as never,
  ({ strapi }) => ({
    async create(ctx) {
      const body = ctx.request.body as { data?: Record<string, unknown> };

      if (body.data) {
        await applyElectricityLogDefaults(strapi, body.data);
      }

      return super.create(ctx);
    },

    async update(ctx) {
      const body = ctx.request.body as { data?: Record<string, unknown> };

      if (!body.data) {
        return super.update(ctx);
      }

      const documentId = ctx.params.id as string;
      const existing = await strapi.db
        .query('api::electricity-log.electricity-log')
        .findOne({ where: { documentId } });

      if (!existing) {
        return super.update(ctx);
      }

      const merged = {
        ...existing,
        ...body.data,
      };

      await applyElectricityLogDefaults(strapi, merged, Number(existing.id));

      copyElectricityComputedFields(merged, body.data);

      return super.update(ctx);
    },
  }),
);

import { factories } from '@strapi/strapi';

import { normalizeSalesRecordInput } from '../utils/normalize-sales-record';

export default factories.createCoreController(
  'api::sales-record.sales-record' as never,
  ({ strapi }) => ({
    async create(ctx) {
      const body = ctx.request.body as { data?: Record<string, unknown> };

      if (body.data) {
        await normalizeSalesRecordInput(strapi, body.data);
      }

      return super.create(ctx);
    },

    async update(ctx) {
      const body = ctx.request.body as { data?: Record<string, unknown> };

      if (body.data?.sold_products) {
        await normalizeSalesRecordInput(strapi, body.data);
      }

      return super.update(ctx);
    },
  }),
);

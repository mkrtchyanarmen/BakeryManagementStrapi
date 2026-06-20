import { factories } from '@strapi/strapi';

export default factories.createCoreController(
  'api::ingredient.ingredient' as never,
  ({ strapi }) => ({
    async withPurchaseUnits(ctx: { body: unknown }) {
      ctx.body = await strapi
        .service('api::ingredient.ingredient')
        .getWithPurchaseUnits();
    },
  }),
);

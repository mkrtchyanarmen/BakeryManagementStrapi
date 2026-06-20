export default {
  async getCurrent(ctx: { body: unknown }) {
    const stock = await strapi
      .service('api::inventory.inventory')
      .getCurrentStock();

    ctx.body = stock;
  },
};

export default {
  async get(ctx: {
    query: { date?: string };
    badRequest: (message: string) => unknown;
    body: unknown;
  }) {
    const { date } = ctx.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return ctx.badRequest('Query parameter "date" is required (YYYY-MM-DD).');
    }

    ctx.body = await strapi.service('api::end-of-day.end-of-day').getEndOfDay(date);
  },
};

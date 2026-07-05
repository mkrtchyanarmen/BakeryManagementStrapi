export default {
  async daily(ctx: {
    query: { date?: string };
    badRequest: (message: string) => unknown;
    body: unknown;
  }) {
    const { date } = ctx.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return ctx.badRequest('Query parameter "date" is required (YYYY-MM-DD).');
    }

    ctx.body = await strapi.service('api::report.report').getDailyReport(date);
  },

  async profitByProduct(ctx: {
    query: { from?: string; to?: string };
    badRequest: (message: string) => unknown;
    body: unknown;
  }) {
    const { from, to } = ctx.query;

    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return ctx.badRequest(
        'Query parameters "from" and "to" are required (YYYY-MM-DD).',
      );
    }

    ctx.body = await strapi
      .service('api::report.report')
      .getProfitByProduct(from, to);
  },

  async dashboard(ctx: {
    query: { date?: string };
    badRequest: (message: string) => unknown;
    body: unknown;
  }) {
    const { date } = ctx.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return ctx.badRequest('Query parameter "date" is required (YYYY-MM-DD).');
    }

    ctx.body = await strapi
      .service('api::report.report')
      .getDashboardSummary(date);
  },

  async monthly(ctx: {
    query: { from?: string; to?: string };
    badRequest: (message: string) => unknown;
    body: unknown;
  }) {
    const { from, to } = ctx.query;

    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return ctx.badRequest(
        'Query parameters "from" and "to" are required (YYYY-MM-DD).',
      );
    }

    ctx.body = await strapi.service('api::report.report').getMonthlyReport(from, to);
  },
};

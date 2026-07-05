export default {
  routes: [
    {
      method: 'GET',
      path: '/reports/daily',
      handler: 'report.daily',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/reports/profit-by-product',
      handler: 'report.profitByProduct',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/reports/monthly',
      handler: 'report.monthly',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};

export default {
  routes: [
    {
      method: 'GET',
      path: '/pos/products',
      handler: 'pos.products',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/pos/sales',
      handler: 'pos.createSale',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/pos/cash-summary',
      handler: 'pos.cashSummary',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/pos/cash-desk',
      handler: 'pos.updateCashDesk',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/pos/electricity',
      handler: 'pos.updateElectricity',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/pos/templates',
      handler: 'pos.templates',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/pos/productions',
      handler: 'pos.productions',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/pos/productions',
      handler: 'pos.createProduction',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/pos/remaining',
      handler: 'pos.remaining',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/pos/ingredients',
      handler: 'pos.ingredients',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'POST',
      path: '/pos/withdrawals',
      handler: 'pos.createWithdrawal',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};

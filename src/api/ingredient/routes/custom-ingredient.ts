export default {
  routes: [
    {
      method: 'GET',
      path: '/ingredients/with-purchase-units',
      handler: 'ingredient.withPurchaseUnits',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};

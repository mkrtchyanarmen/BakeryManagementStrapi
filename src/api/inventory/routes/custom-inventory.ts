export default {
  routes: [
    {
      method: 'GET',
      path: '/inventory/current',
      handler: 'inventory.getCurrent',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};

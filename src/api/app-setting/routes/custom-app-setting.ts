export default {
  routes: [
    {
      method: 'GET',
      path: '/app-setting/electricity-price',
      handler: 'app-setting.electricityPrice',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};

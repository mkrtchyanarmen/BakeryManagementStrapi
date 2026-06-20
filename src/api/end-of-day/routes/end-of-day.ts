export default {
  routes: [
    {
      method: 'GET',
      path: '/end-of-day',
      handler: 'end-of-day.get',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};

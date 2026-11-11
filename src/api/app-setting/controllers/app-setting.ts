import { factories } from '@strapi/strapi';

import { getElectricityPrices } from '../../../utils/app-settings';

export default factories.createCoreController(
  'api::app-setting.app-setting' as never,
  () => ({
    async electricityPrice(ctx: { body: unknown }) {
      const prices = await getElectricityPrices(strapi);
      ctx.body = {
        price_per_kwh: prices.day,
        night_price_per_kwh: prices.night,
      };
    },
  }),
);

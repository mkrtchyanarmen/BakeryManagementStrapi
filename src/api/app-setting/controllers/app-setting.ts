import { factories } from '@strapi/strapi';

import { getElectricityPricePerKwh } from '../../../utils/app-settings';

export default factories.createCoreController(
  'api::app-setting.app-setting' as never,
  () => ({
    async electricityPrice(ctx: { body: unknown }) {
      ctx.body = {
        price_per_kwh: await getElectricityPricePerKwh(strapi),
      };
    },
  }),
);

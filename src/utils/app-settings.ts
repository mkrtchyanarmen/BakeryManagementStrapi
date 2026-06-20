import type { Core } from '@strapi/strapi';

export async function getAppSettings(strapi: Core.Strapi) {
  return strapi.db.query('api::app-setting.app-setting').findOne({});
}

export async function getElectricityPricePerKwh(strapi: Core.Strapi): Promise<number> {
  const settings = await getAppSettings(strapi);
  return settings ? Number(settings.electricity_price_per_kwh) : 0;
}

export async function ensureAppSettings(strapi: Core.Strapi) {
  const existing = await getAppSettings(strapi);

  if (existing) {
    return existing;
  }

  return strapi.db.query('api::app-setting.app-setting').create({
    data: {
      electricity_price_per_kwh: 0,
      rental_price: 200000,
      counter_service_fee: 10000,
      mandatory_payment: 0,
    },
  });
}

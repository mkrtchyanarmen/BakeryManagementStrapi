import type { Core } from '@strapi/strapi';

export async function getAppSettings(strapi: Core.Strapi) {
  return strapi.db.query('api::app-setting.app-setting').findOne({});
}

export async function getElectricityPricePerKwh(strapi: Core.Strapi): Promise<number> {
  const settings = await getAppSettings(strapi);
  return settings ? Number(settings.electricity_price_per_kwh) : 0;
}

/** Day and night tariffs; night falls back to the day price when unset. */
export async function getElectricityPrices(
  strapi: Core.Strapi,
): Promise<{ day: number; night: number }> {
  const settings = await getAppSettings(strapi);
  const day = settings ? Number(settings.electricity_price_per_kwh ?? 0) : 0;
  const night =
    settings?.electricity_night_price_per_kwh != null
      ? Number(settings.electricity_night_price_per_kwh)
      : day;

  return { day, night };
}

export async function ensureAppSettings(strapi: Core.Strapi) {
  const existing = await getAppSettings(strapi);

  if (existing) {
    return existing;
  }

  return strapi.db.query('api::app-setting.app-setting').create({
    data: {
      electricity_price_per_kwh: 0,
      electricity_night_price_per_kwh: 0,
      rental_price: 200000,
      counter_service_fee: 10000,
      mandatory_payment: 0,
    },
  });
}

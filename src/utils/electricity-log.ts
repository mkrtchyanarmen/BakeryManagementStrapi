import type { Core } from '@strapi/strapi';

import { getElectricityPricePerKwh } from './app-settings';
import { multiplyMoney, roundMoney } from './money';

export const ELECTRICITY_READING_ERROR =
  'Հաշվիչի ցուցանիշը պետք է մեծ լինի նախորդից';

type ElectricityLogRow = {
  id?: number;
  date?: string;
  meter_reading: number;
};

export async function getPreviousElectricityLog(
  strapi: Core.Strapi,
  date: string,
  excludeId?: number,
): Promise<ElectricityLogRow | null> {
  const previousLogs = await strapi.db
    .query('api::electricity-log.electricity-log')
    .findMany({
      where: {
        date: { $lt: date },
        ...(excludeId ? { id: { $ne: excludeId } } : {}),
      },
      orderBy: { date: 'desc' },
      limit: 1,
    });

  return (previousLogs[0] as ElectricityLogRow | undefined) ?? null;
}

export async function applyElectricityLogDefaults(
  strapi: Core.Strapi,
  data: Record<string, unknown>,
  currentId?: number,
) {
  const date = String(data.date);
  const meterReading = Number(data.meter_reading);
  const previousLog = await getPreviousElectricityLog(strapi, date, currentId);
  const previousReading = previousLog
    ? Number(previousLog.meter_reading)
    : meterReading;
  const kwhUsed = roundMoney(meterReading - previousReading);

  if (kwhUsed < 0) {
    throw new Error(ELECTRICITY_READING_ERROR);
  }

  const pricePerKwh = await getElectricityPricePerKwh(strapi);

  data.kwh_used = kwhUsed;
  data.total_cost = multiplyMoney(kwhUsed, pricePerKwh);
}

export function getPreviousReadingFromLog(
  previousLog: ElectricityLogRow | null,
  meterReading: number,
) {
  return previousLog ? Number(previousLog.meter_reading) : meterReading;
}

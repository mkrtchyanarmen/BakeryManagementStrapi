import type { Core } from '@strapi/strapi';

import { getElectricityPrices } from './app-settings';
import { multiplyMoney, roundMoney, sumMoney } from './money';

export const ELECTRICITY_READING_ERROR =
  'Հաշվիչի ցուցանիշը պետք է մեծ լինի նախորդից';

/** Fields computed from the readings; copied onto update payloads. */
export const ELECTRICITY_COMPUTED_FIELDS = [
  'kwh_day',
  'kwh_night',
  'kwh_used',
  'day_cost',
  'night_cost',
  'total_cost',
] as const;

type ElectricityLogRow = {
  id?: number;
  date?: string;
  morning_reading?: number | null;
  meter_reading?: number | null;
};

function toReading(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Latest log before `date` that has an evening (meter) reading. */
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
        meter_reading: { $notNull: true },
        ...(excludeId ? { id: { $ne: excludeId } } : {}),
      },
      orderBy: { date: 'desc' },
      limit: 1,
    });

  return (previousLogs[0] as ElectricityLogRow | undefined) ?? null;
}

export type ElectricityUsage = {
  kwh_day: number;
  kwh_night: number;
  kwh_used: number;
  day_cost: number;
  night_cost: number;
  total_cost: number;
};

/**
 * Night usage = morning − previous evening (night tariff).
 * Day usage   = evening − morning (day tariff).
 * Without a morning reading the whole span since the previous evening is
 * billed at the day tariff (legacy single-reading logs).
 */
export function computeElectricityUsage(input: {
  morningReading: number | null;
  eveningReading: number | null;
  previousEveningReading: number | null;
  dayPrice: number;
  nightPrice: number;
}): ElectricityUsage {
  const { morningReading, eveningReading, previousEveningReading, dayPrice, nightPrice } =
    input;

  let kwhNight = 0;
  let kwhDay = 0;

  if (morningReading != null) {
    if (previousEveningReading != null) {
      kwhNight = roundMoney(morningReading - previousEveningReading);
    }
    if (eveningReading != null) {
      kwhDay = roundMoney(eveningReading - morningReading);
    }
  } else if (eveningReading != null && previousEveningReading != null) {
    kwhDay = roundMoney(eveningReading - previousEveningReading);
  }

  if (kwhDay < 0 || kwhNight < 0) {
    throw new Error(ELECTRICITY_READING_ERROR);
  }

  const dayCost = multiplyMoney(kwhDay, dayPrice);
  const nightCost = multiplyMoney(kwhNight, nightPrice);

  return {
    kwh_day: kwhDay,
    kwh_night: kwhNight,
    kwh_used: roundMoney(kwhDay + kwhNight),
    day_cost: dayCost,
    night_cost: nightCost,
    total_cost: sumMoney([dayCost, nightCost]),
  };
}

export async function applyElectricityLogDefaults(
  strapi: Core.Strapi,
  data: Record<string, unknown>,
  currentId?: number,
) {
  const date = String(data.date);
  const morningReading = toReading(data.morning_reading);
  const eveningReading = toReading(data.meter_reading);

  if (morningReading == null && eveningReading == null) {
    throw new Error('Մուտքագրեք առավոտյան կամ երեկոյան ցուցանիշը');
  }

  const previousLog = await getPreviousElectricityLog(strapi, date, currentId);
  const prices = await getElectricityPrices(strapi);

  Object.assign(
    data,
    computeElectricityUsage({
      morningReading,
      eveningReading,
      previousEveningReading: toReading(previousLog?.meter_reading),
      dayPrice: prices.day,
      nightPrice: prices.night,
    }),
  );
}

export function copyElectricityComputedFields(
  from: Record<string, unknown>,
  to: Record<string, unknown>,
) {
  for (const field of ELECTRICITY_COMPUTED_FIELDS) {
    to[field] = from[field];
  }
}

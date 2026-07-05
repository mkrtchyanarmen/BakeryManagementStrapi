import {
  getDailyMonthlyCost,
  sumProductionIngredientsCost,
  type ProductionRow,
} from './end-of-day-calc';
import { eachDateInRange } from './monthly-report-calc';
import { roundMoney, sumMoney } from './money';

type AppSettingsRow = {
  rental_price: number;
  counter_service_fee: number;
  mandatory_payment?: number | null;
};

type ElectricityRow = {
  date: string;
  total_cost: number | null;
};

export function buildDashboardSeparateAccounts(input: {
  date: string;
  settings: AppSettingsRow;
  productions: ProductionRow[];
  electricityLogs: ElectricityRow[];
}) {
  const { date, settings, productions, electricityLogs } = input;
  const monthFrom = `${date.slice(0, 7)}-01`;
  const dates = eachDateInRange(monthFrom, date);

  const rentalMonthly = Number(settings.rental_price);
  const counterMonthly = Number(settings.counter_service_fee);
  const mandatoryMonthly = Number(settings.mandatory_payment ?? 0);

  const electricityByDate = new Map(
    electricityLogs.map((row) => [String(row.date).slice(0, 10), row]),
  );

  let rentalMtd = 0;
  let counterMtd = 0;
  let mandatoryMtd = 0;
  let electricityMtd = 0;

  for (const day of dates) {
    rentalMtd = sumMoney([rentalMtd, getDailyMonthlyCost(rentalMonthly, day)]);
    counterMtd = sumMoney([counterMtd, getDailyMonthlyCost(counterMonthly, day)]);
    mandatoryMtd = sumMoney([
      mandatoryMtd,
      getDailyMonthlyCost(mandatoryMonthly, day),
    ]);

    const electricityLog = electricityByDate.get(day);
    if (electricityLog?.total_cost != null) {
      electricityMtd = sumMoney([
        electricityMtd,
        Number(electricityLog.total_cost),
      ]);
    }
  }

  const mandatoryPaymentsTotal = sumMoney([
    rentalMtd,
    counterMtd,
    mandatoryMtd,
    electricityMtd,
  ]);

  const ingredientsUsedMtd = sumProductionIngredientsCost(productions);

  return {
    date,
    month_from: monthFrom,
    mandatory_payments: {
      rental: rentalMtd,
      counter: counterMtd,
      mandatory: mandatoryMtd,
      electricity: electricityMtd,
      total: mandatoryPaymentsTotal,
      monthly_total: sumMoney([
        rentalMonthly,
        counterMonthly,
        mandatoryMonthly,
      ]),
    },
    ingredients_used: roundMoney(ingredientsUsedMtd),
    separate_accounts_total: sumMoney([
      mandatoryPaymentsTotal,
      ingredientsUsedMtd,
    ]),
  };
}

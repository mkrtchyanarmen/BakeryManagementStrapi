import {
  getDailyMonthlyCost,
  sumProductionIngredientsCost,
  type ProductionRow,
} from "./end-of-day-calc";
import { eachDateInRange } from "./monthly-report-calc";
import { roundMoney, sumMoney } from "./money";

type AppSettingsRow = {
  rental_price: number;
  counter_service_fee: number;
  mandatory_payment?: number | null;
};

type ElectricityRow = {
  date: string;
  total_cost: number | null;
};

type IngredientPurchaseRow = {
  total_price: number | string;
  is_paid: boolean;
  quantity: number | string;
  ingredient?: { documentId?: string; name?: string } | null;
};

export function buildDashboardSeparateAccounts(input: {
  date: string;
  settings: AppSettingsRow;
  productions: ProductionRow[];
  electricityLogs: ElectricityRow[];
  ingredientPurchases?: IngredientPurchaseRow[];
}) {
  const {
    date,
    settings,
    productions,
    electricityLogs,
    ingredientPurchases = [],
  } = input;
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
    counterMtd = sumMoney([
      counterMtd,
      getDailyMonthlyCost(counterMonthly, day),
    ]);
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
  const purchasesByIngredient = new Map<
    string,
    {
      ingredient_name: string;
      paid_quantity: number;
      due_quantity: number;
      paid_amount: number;
      due_amount: number;
    }
  >();

  for (const purchase of ingredientPurchases) {
    const name = purchase.ingredient?.name ?? "Անհայտ հումք";
    const key = purchase.ingredient?.documentId ?? name;
    const item = purchasesByIngredient.get(key) ?? {
      ingredient_name: name,
      paid_quantity: 0,
      due_quantity: 0,
      paid_amount: 0,
      due_amount: 0,
    };
    const quantity = Number(purchase.quantity) || 0;
    const amount = Number(purchase.total_price) || 0;

    if (purchase.is_paid) {
      item.paid_quantity += quantity;
      item.paid_amount = sumMoney([item.paid_amount, amount]);
    } else {
      item.due_quantity += quantity;
      item.due_amount = sumMoney([item.due_amount, amount]);
    }
    purchasesByIngredient.set(key, item);
  }

  const purchaseItems = Array.from(purchasesByIngredient.values()).sort(
    (a, b) => a.ingredient_name.localeCompare(b.ingredient_name, "hy"),
  );
  const totalPaid = sumMoney(purchaseItems.map((item) => item.paid_amount));
  const totalDue = sumMoney(purchaseItems.map((item) => item.due_amount));

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
    ingredient_purchases: {
      items: purchaseItems,
      total_paid: totalPaid,
      total_due: totalDue,
      balance: sumMoney([totalPaid, -totalDue]),
    },
    separate_accounts_total: sumMoney([
      mandatoryPaymentsTotal,
      ingredientsUsedMtd,
    ]),
  };
}

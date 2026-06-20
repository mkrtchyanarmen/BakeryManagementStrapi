import type { Core } from '@strapi/strapi';

import { multiplyMoney, roundMoney, sumMoney } from './money';

type IngredientRef = {
  id?: number;
  documentId?: string;
  name?: string;
  price?: number;
  unit?: string | null;
};

type UsedIngredientLine = {
  count: number;
  ingredient?: IngredientRef | null;
};

type CreatedProductLine = {
  count: number;
  product?: {
    id?: number;
    documentId?: string;
    name?: string;
    selling_price?: number;
  } | null;
};

type ProductionRow = {
  total_price: number;
  production_price: number;
  expected_income: number;
  used_ingredients?: UsedIngredientLine[];
  created_products?: CreatedProductLine[];
};

type SoldProductLine = {
  count: number;
  product?: {
    id?: number;
    documentId?: string;
    name?: string;
    selling_price?: number;
  } | null;
};

type AppSettingsRow = {
  rental_price: number;
  counter_service_fee: number;
  mandatory_payment?: number | null;
};

export function getDaysInMonth(date: string) {
  const [year, month] = date.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

export function getDailyMonthlyCost(monthlyAmount: number, date: string) {
  const daysInMonth = getDaysInMonth(date);
  return daysInMonth > 0 ? roundMoney(monthlyAmount / daysInMonth) : 0;
}

export function aggregateIngredientUsage(productions: ProductionRow[]) {
  const map = new Map<
    string,
    {
      name: string;
      unit: string | null;
      quantity: number;
      unit_price: number;
      total_cost: number;
    }
  >();

  for (const production of productions) {
    for (const line of production.used_ingredients ?? []) {
      const ingredient = line.ingredient;
      if (!ingredient?.documentId && !ingredient?.id) continue;

      const key = String(ingredient.documentId ?? ingredient.id);
      const unitPrice = Number(ingredient.price ?? 0);
      const quantity = Number(line.count);
      const lineCost = multiplyMoney(unitPrice, quantity);
      const existing = map.get(key);

      if (existing) {
        existing.quantity = roundMoney(existing.quantity + quantity);
        existing.total_cost = sumMoney([existing.total_cost, lineCost]);
        continue;
      }

      map.set(key, {
        name: String(ingredient.name ?? '—'),
        unit: ingredient.unit ?? null,
        quantity,
        unit_price: unitPrice,
        total_cost: lineCost,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'hy'));
}

export function sumProductionWorkerPay(productions: ProductionRow[]) {
  return sumMoney(productions.map((production) => Number(production.production_price)));
}

export function sumProductionIngredientsCost(productions: ProductionRow[]) {
  return sumMoney(
    productions.map((production) =>
      roundMoney(
        Number(production.total_price) -
          Number(production.production_price) -
          Number(production.expected_income),
      ),
    ),
  );
}

export function aggregateProducedProducts(productions: ProductionRow[]) {
  const map = new Map<
    string,
    {
      productDocumentId: string;
      productName: string;
      quantityProduced: number;
      sellingPrice: number;
    }
  >();

  for (const production of productions) {
    for (const line of production.created_products ?? []) {
      if (!line.product?.documentId) continue;

      const key = line.product.documentId;
      const existing = map.get(key);

      if (existing) {
        existing.quantityProduced = roundMoney(
          existing.quantityProduced + Number(line.count),
        );
        continue;
      }

      map.set(key, {
        productDocumentId: key,
        productName: String(line.product.name ?? '—'),
        quantityProduced: Number(line.count),
        sellingPrice: Number(line.product.selling_price ?? 0),
      });
    }
  }

  return map;
}

export function aggregateSoldProducts(soldProducts: SoldProductLine[]) {
  const map = new Map<string, number>();

  for (const line of soldProducts) {
    if (!line.product?.documentId) continue;
    const key = line.product.documentId;
    map.set(key, roundMoney((map.get(key) ?? 0) + Number(line.count)));
  }

  return map;
}

export function buildRemainingProducts(
  productions: ProductionRow[],
  soldProducts: SoldProductLine[],
) {
  const producedMap = aggregateProducedProducts(productions);
  const soldMap = aggregateSoldProducts(soldProducts);

  return Array.from(producedMap.values())
    .map((item) => {
      const quantitySold = soldMap.get(item.productDocumentId) ?? 0;
      const quantityRemaining = Math.max(item.quantityProduced - quantitySold, 0);

      return {
        product_name: item.productName,
        quantity_remaining: quantityRemaining,
        selling_price: item.sellingPrice,
        total_value: multiplyMoney(quantityRemaining, item.sellingPrice),
      };
    })
    .filter((item) => item.quantity_remaining > 0)
    .sort((a, b) => a.product_name.localeCompare(b.product_name, 'hy'));
}

export type EndOfDayCalculationInput = {
  date: string;
  settings: AppSettingsRow;
  productions: ProductionRow[];
  soldProducts: SoldProductLine[];
  totalRevenue: number;
  electricityCost: number | null;
};

export function calculateEndOfDayBreakdown(input: EndOfDayCalculationInput) {
  const { date, settings, productions, soldProducts, totalRevenue, electricityCost } =
    input;

  const daysInMonth = getDaysInMonth(date);
  const ingredients = aggregateIngredientUsage(productions);
  const ingredientsCost = sumProductionIngredientsCost(productions);
  const productionPrice = sumProductionWorkerPay(productions);

  const rentalMonthly = Number(settings.rental_price);
  const counterMonthly = Number(settings.counter_service_fee);
  const mandatoryMonthly = Number(settings.mandatory_payment ?? 0);

  const rentalDaily = getDailyMonthlyCost(rentalMonthly, date);
  const counterDaily = getDailyMonthlyCost(counterMonthly, date);
  const mandatoryDaily = getDailyMonthlyCost(mandatoryMonthly, date);
  const electricity = electricityCost ?? 0;

  const operatingCostsWithoutWorkers = sumMoney([
    ingredientsCost,
    rentalDaily,
    counterDaily,
    mandatoryDaily,
    electricity,
  ]);

  const totalCostsWithWorkers = sumMoney([
    operatingCostsWithoutWorkers,
    productionPrice,
  ]);

  const totalWithoutProduction = roundMoney(totalRevenue - productionPrice);

  const expectedCashCard = totalWithoutProduction;
  const remainingProducts = buildRemainingProducts(productions, soldProducts);
  const unsoldProductsValue = sumMoney(
    remainingProducts.map((item) => item.total_value),
  );

  const monthlyReserveDaily = sumMoney([
    rentalDaily,
    counterDaily,
    mandatoryDaily,
    electricity,
  ]);
  const monthlyReserveTotal = sumMoney([
    rentalMonthly,
    counterMonthly,
    mandatoryMonthly,
  ]);
  const dailyIncome = roundMoney(totalRevenue - totalCostsWithWorkers);

  return {
    days_in_month: daysInMonth,
    costs: {
      ingredients,
      ingredients_cost: ingredientsCost,
      production_price: productionPrice,
      rental: {
        monthly: rentalMonthly,
        daily: rentalDaily,
      },
      counter: {
        monthly: counterMonthly,
        daily: counterDaily,
      },
      mandatory: {
        monthly: mandatoryMonthly,
        daily: mandatoryDaily,
      },
      electricity,
      total_with_production: roundMoney(totalRevenue),
      total_without_production: totalWithoutProduction,
    },
    expected_cash_card: expectedCashCard,
    remaining_products: remainingProducts,
    unsold_products_value: unsoldProductsValue,
    summary: {
      total_revenue: totalRevenue,
      daily_income: dailyIncome,
      monthly_reserve: {
        daily: monthlyReserveDaily,
        monthly_total: monthlyReserveTotal,
        rental: { monthly: rentalMonthly, daily: rentalDaily },
        counter: { monthly: counterMonthly, daily: counterDaily },
        mandatory: { monthly: mandatoryMonthly, daily: mandatoryDaily },
        electricity,
      },
      electricity_cost: electricityCost,
      net_after_electricity:
        electricityCost != null ? roundMoney(totalRevenue - electricity) : null,
      net_after_operating_costs: expectedCashCard,
      net_after_all_costs: dailyIncome,
    },
  };
}

export async function loadEndOfDayProductions(strapi: Core.Strapi, date: string) {
  return strapi.db.query('api::production.production').findMany({
    where: { date },
    populate: {
      used_ingredients: {
        populate: { ingredient: true },
      },
      created_products: {
        populate: { product: true },
      },
    },
  }) as Promise<ProductionRow[]>;
}

export async function loadEndOfDaySoldProducts(strapi: Core.Strapi, date: string) {
  const salesRecord = await strapi.db.query('api::sales-record.sales-record').findOne({
    where: { date },
    populate: {
      sold_products: {
        populate: { product: true },
      },
    },
  });

  return (salesRecord?.sold_products as SoldProductLine[] | undefined) ?? [];
}

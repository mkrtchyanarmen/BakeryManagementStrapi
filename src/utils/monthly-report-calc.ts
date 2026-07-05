import { calculateEndOfDayBreakdown, type ProductionRow } from './end-of-day-calc';
import { multiplyMoney, roundMoney, sumMoney } from './money';

type ProductRef = {
  id?: number;
  documentId?: string;
  name?: string;
  size?: string;
  selling_price?: number;
};

type CreatedProductLine = {
  count: number;
  product?: ProductRef | null;
};

type ProductionRecord = ProductionRow & {
  date: string;
};

type SalesRecord = {
  date: string;
  total_price: number;
  sold_products?: CreatedProductLine[];
};

type CashReportRow = {
  date: string;
  cash_amount: number;
  card_amount: number;
};

type ElectricityRow = {
  date: string;
  total_cost: number | null;
};

type AppSettingsRow = {
  rental_price: number;
  counter_service_fee: number;
  mandatory_payment?: number | null;
};

type ProductMonthlyAggregate = {
  product_key: string;
  product_name: string;
  size: string;
  total_produced: number;
  total_sold: number;
  total_revenue: number;
  daily_sold: Map<string, number>;
};

function getProductKey(product: ProductRef): string {
  const id = product.id ?? product.documentId ?? 'unknown';
  return `${id}:${product.name ?? '—'}:${product.size ?? 'none'}`;
}

export function eachDateInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${from}T12:00:00.000Z`);
  const end = new Date(`${to}T12:00:00.000Z`);

  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function groupByDate<T extends { date: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();

  for (const row of rows) {
    const date = String(row.date).slice(0, 10);
    const bucket = map.get(date) ?? [];
    bucket.push(row);
    map.set(date, bucket);
  }

  return map;
}

function flattenSoldProducts(records: SalesRecord[]): CreatedProductLine[] {
  return records.flatMap((record) => record.sold_products ?? []);
}

function buildProductMonthlyAggregates(
  productions: ProductionRecord[],
  salesRecords: SalesRecord[],
): Map<string, ProductMonthlyAggregate> {
  const aggregates = new Map<string, ProductMonthlyAggregate>();

  for (const production of productions) {
    for (const line of production.created_products ?? []) {
      const product = line.product;
      if (!product?.id && !product?.documentId) continue;

      const key = getProductKey(product);
      const quantity = Number(line.count);
      const entry = aggregates.get(key) ?? {
        product_key: key,
        product_name: product.name ?? '—',
        size: product.size ?? 'none',
        total_produced: 0,
        total_sold: 0,
        total_revenue: 0,
        daily_sold: new Map<string, number>(),
      };

      entry.total_produced = roundMoney(entry.total_produced + quantity);
      aggregates.set(key, entry);
    }
  }

  for (const record of salesRecords) {
    const date = String(record.date).slice(0, 10);

    for (const line of record.sold_products ?? []) {
      const product = line.product;
      if (!product?.id && !product?.documentId) continue;

      const key = getProductKey(product);
      const quantity = Number(line.count);
      const sellingPrice = Number(product.selling_price ?? 0);
      const entry = aggregates.get(key) ?? {
        product_key: key,
        product_name: product.name ?? '—',
        size: product.size ?? 'none',
        total_produced: 0,
        total_sold: 0,
        total_revenue: 0,
        daily_sold: new Map<string, number>(),
      };

      entry.total_sold = roundMoney(entry.total_sold + quantity);
      entry.total_revenue = sumMoney([
        entry.total_revenue,
        multiplyMoney(quantity, sellingPrice),
      ]);
      entry.daily_sold.set(
        date,
        roundMoney((entry.daily_sold.get(date) ?? 0) + quantity),
      );
      aggregates.set(key, entry);
    }
  }

  return aggregates;
}

function computeSuggestedDaily(dailySold: Map<string, number>): {
  avg_daily_sold: number;
  recent_daily_sold: number | null;
  suggested_daily: number;
  days_with_sales: number;
} {
  const saleDays = Array.from(dailySold.entries())
    .filter(([, qty]) => qty > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  const daysWithSales = saleDays.length;
  const totalSold = sumMoney(saleDays.map(([, qty]) => qty));
  const avgDailySold =
    daysWithSales > 0 ? roundMoney(totalSold / daysWithSales) : 0;

  const recentDays = saleDays.slice(-2);
  const recentDailySold =
    recentDays.length > 0
      ? roundMoney(
          sumMoney(recentDays.map(([, qty]) => qty)) / recentDays.length,
        )
      : null;

  const suggestedDaily = Math.max(
    0,
    Math.round(recentDailySold ?? avgDailySold),
  );

  return {
    avg_daily_sold: avgDailySold,
    recent_daily_sold: recentDailySold,
    suggested_daily: suggestedDaily,
    days_with_sales: daysWithSales,
  };
}

export function buildMonthlyReport(input: {
  from: string;
  to: string;
  settings: AppSettingsRow;
  productions: ProductionRecord[];
  salesRecords: SalesRecord[];
  cashReports: CashReportRow[];
  electricityLogs: ElectricityRow[];
}) {
  const {
    from,
    to,
    settings,
    productions,
    salesRecords,
    cashReports,
    electricityLogs,
  } = input;

  const dates = eachDateInRange(from, to);
  const productionsByDate = groupByDate(productions);
  const salesByDate = groupByDate(salesRecords);
  const cashByDate = new Map(
    cashReports.map((row) => [String(row.date).slice(0, 10), row]),
  );
  const electricityByDate = new Map(
    electricityLogs.map((row) => [String(row.date).slice(0, 10), row]),
  );

  const dailyIncome: Array<{
    date: string;
    income: number;
    revenue: number;
  }> = [];
  const dailyPayments: Array<{
    date: string;
    cash: number;
    card: number;
    total: number;
  }> = [];

  for (const date of dates) {
    const dayProductions = productionsByDate.get(date) ?? [];
    const daySales = salesByDate.get(date) ?? [];
    const soldProducts = flattenSoldProducts(daySales);
    const totalRevenue = sumMoney(
      daySales.map((record) => Number(record.total_price)),
    );
    const electricityLog = electricityByDate.get(date);
    const electricityCost = electricityLog?.total_cost != null
      ? Number(electricityLog.total_cost)
      : null;

    const breakdown = calculateEndOfDayBreakdown({
      date,
      settings,
      productions: dayProductions,
      soldProducts,
      totalRevenue,
      electricityCost,
    });

    dailyIncome.push({
      date,
      income: breakdown.summary.daily_income,
      revenue: totalRevenue,
    });

    const cash = cashByDate.get(date);
    const cashAmount = cash ? Number(cash.cash_amount ?? 0) : 0;
    const cardAmount = cash ? Number(cash.card_amount ?? 0) : 0;

    dailyPayments.push({
      date,
      cash: cashAmount,
      card: cardAmount,
      total: sumMoney([cashAmount, cardAmount]),
    });
  }

  const productAggregates = buildProductMonthlyAggregates(
    productions,
    salesRecords,
  );

  const bestSellers = Array.from(productAggregates.values())
    .filter((entry) => entry.total_sold > 0)
    .map((entry) => ({
      product_name: entry.product_name,
      size: entry.size,
      total_sold: entry.total_sold,
      total_revenue: entry.total_revenue,
      total_produced: entry.total_produced,
    }))
    .sort((a, b) => b.total_sold - a.total_sold);

  const unsoldProducts = Array.from(productAggregates.values())
    .map((entry) => {
      const remaining = Math.max(
        roundMoney(entry.total_produced - entry.total_sold),
        0,
      );
      const unsoldRate =
        entry.total_produced > 0
          ? roundMoney((remaining / entry.total_produced) * 100)
          : 0;

      return {
        product_name: entry.product_name,
        size: entry.size,
        total_produced: entry.total_produced,
        total_sold: entry.total_sold,
        remaining,
        unsold_rate: unsoldRate,
      };
    })
    .filter((entry) => entry.remaining > 0)
    .sort((a, b) => b.unsold_rate - a.unsold_rate);

  const productDemand = Array.from(productAggregates.values())
    .filter((entry) => entry.total_sold > 0)
    .map((entry) => {
      const demand = computeSuggestedDaily(entry.daily_sold);

      return {
        product_name: entry.product_name,
        size: entry.size,
        total_sold: entry.total_sold,
        days_with_sales: demand.days_with_sales,
        avg_daily_sold: demand.avg_daily_sold,
        recent_daily_sold: demand.recent_daily_sold,
        suggested_daily: demand.suggested_daily,
      };
    })
    .sort((a, b) => b.suggested_daily - a.suggested_daily);

  const totalRevenue = sumMoney(dailyIncome.map((day) => day.revenue));
  const totalIncome = sumMoney(dailyIncome.map((day) => day.income));
  const totalCash = sumMoney(dailyPayments.map((day) => day.cash));
  const totalCard = sumMoney(dailyPayments.map((day) => day.card));

  return {
    from,
    to,
    best_sellers: bestSellers,
    unsold_products: unsoldProducts,
    product_demand: productDemand,
    daily_income: dailyIncome,
    daily_payments: dailyPayments,
    summary: {
      total_revenue: totalRevenue,
      total_income: totalIncome,
      total_cash: totalCash,
      total_card: totalCard,
      days_in_period: dates.length,
    },
  };
}

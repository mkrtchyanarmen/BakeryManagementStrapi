import { getElectricityPricePerKwh } from '../../../utils/app-settings';
import { multiplyMoney, roundMoney, sumMoney } from '../../../utils/money';

type ProductRef = {
  id: number;
  name: string;
  size?: string;
  selling_price?: number;
};

type CreatedProductLine = {
  count: number;
  product?: ProductRef | null;
};

type ProductionRecord = {
  total_price: number;
  created_products?: CreatedProductLine[];
};

type SalesRecord = {
  total_price: number;
  sold_products?: CreatedProductLine[];
};

type ProductAggregate = {
  product: ProductRef;
  quantity: number;
  totalCost: number;
  costPerUnits: number[];
};

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return roundMoney(sumMoney(values) / values.length);
}

function getProductKey(product: ProductRef): string {
  return `${product.id}:${product.name}:${product.size ?? 'none'}`;
}

function aggregateProductionByProduct(
  productions: ProductionRecord[],
): Map<number, ProductAggregate> {
  const aggregates = new Map<number, ProductAggregate>();

  for (const production of productions) {
    const lines = production.created_products ?? [];
    const totalCount = sumMoney(lines.map((line) => Number(line.count)));

    if (totalCount <= 0) {
      continue;
    }

    const batchTotal = Number(production.total_price);

    for (const line of lines) {
      const product = line.product;
      if (!product?.id) {
        continue;
      }

      const quantity = Number(line.count);
      const lineCost = multiplyMoney(batchTotal, quantity / totalCount);
      const costPerUnit =
        quantity > 0 ? roundMoney(lineCost / quantity) : 0;

      const entry = aggregates.get(product.id) ?? {
        product,
        quantity: 0,
        totalCost: 0,
        costPerUnits: [],
      };

      entry.quantity += quantity;
      entry.totalCost = sumMoney([entry.totalCost, lineCost]);
      entry.costPerUnits.push(costPerUnit);
      aggregates.set(product.id, entry);
    }
  }

  return aggregates;
}

function flattenSoldProducts(records: SalesRecord[]): CreatedProductLine[] {
  return records.flatMap((record) => record.sold_products ?? []);
}

export default () => ({
  async getDailyReport(date: string) {
    const productions = await strapi.db
      .query('api::production.production')
      .findMany({
        where: { date },
        populate: {
          created_products: {
            populate: { product: true },
          },
        },
      });

    const salesRecords = await strapi.db
      .query('api::sales-record.sales-record')
      .findMany({
        where: { date },
        populate: {
          sold_products: {
            populate: { product: true },
          },
        },
      });

    const salesLines = flattenSoldProducts(salesRecords as SalesRecord[]);

    const cashReport = await strapi.db
      .query('api::daily-cash-report.daily-cash-report')
      .findOne({
        where: { date },
      });

    const electricity = await strapi.db
      .query('api::electricity-log.electricity-log')
      .findOne({
        where: { date },
      });

    const productionAggregates = aggregateProductionByProduct(
      productions as ProductionRecord[],
    );

    const production = Array.from(productionAggregates.values()).map(
      (entry) => ({
        product_name: entry.product.name,
        size: entry.product.size ?? 'none',
        quantity_produced: entry.quantity,
        cost_per_unit:
          entry.quantity > 0
            ? roundMoney(entry.totalCost / entry.quantity)
            : 0,
        total_cost: entry.totalCost,
      }),
    );

    const sales = salesLines.map((line) => {
      const product = line.product as ProductRef;
      const aggregate = productionAggregates.get(product.id);
      const costPerUnit = average(aggregate?.costPerUnits ?? []);
      const quantitySold = Number(line.count);
      const sellingPrice = Number(product.selling_price ?? 0);
      const revenue = multiplyMoney(quantitySold, sellingPrice);
      const profitPerUnit = roundMoney(sellingPrice - costPerUnit);

      return {
        product_name: product.name,
        size: product.size ?? 'none',
        quantity_sold: quantitySold,
        selling_price: sellingPrice,
        revenue,
        cost_per_unit: costPerUnit,
        profit_per_unit: profitPerUnit,
        total_profit: multiplyMoney(profitPerUnit, quantitySold),
      };
    });

    const totalRevenue = sumMoney(sales.map((sale) => sale.revenue));
    const totalProductionCost = sumMoney(
      productions.map((entry) => Number(entry.total_price)),
    );
    const electricityCost = electricity ? Number(electricity.total_cost) : 0;
    const electricityPricePerKwh = await getElectricityPricePerKwh(strapi);

    return {
      date,
      production,
      sales,
      cash_report: cashReport
        ? {
            cash_amount: Number(cashReport.cash_amount),
            card_amount: Number(cashReport.card_amount),
            total_entered: Number(cashReport.total_entered),
            total_from_sales: Number(cashReport.total_from_sales),
            difference: Number(cashReport.difference),
            is_balanced: Boolean(cashReport.is_balanced),
          }
        : null,
      electricity: electricity
        ? {
            kwh_used: Number(electricity.kwh_used),
            price_per_kwh: electricityPricePerKwh,
            total_cost: Number(electricity.total_cost),
          }
        : null,
      summary: {
        total_revenue: totalRevenue,
        total_production_cost: totalProductionCost,
        electricity_cost: electricityCost,
        net_profit: roundMoney(
          totalRevenue - totalProductionCost - electricityCost,
        ),
      },
    };
  },

  async getProfitByProduct(from: string, to: string) {
    const productions = await strapi.db
      .query('api::production.production')
      .findMany({
        where: { date: { $gte: from, $lte: to } },
        populate: {
          created_products: {
            populate: { product: true },
          },
        },
      });

    const salesRecords = await strapi.db
      .query('api::sales-record.sales-record')
      .findMany({
        where: { date: { $gte: from, $lte: to } },
        populate: {
          sold_products: {
            populate: { product: true },
          },
        },
      });

    const salesLines = flattenSoldProducts(salesRecords as SalesRecord[]);

    type Aggregate = {
      product_name: string;
      size: string;
      total_produced: number;
      total_sold: number;
      costPerUnits: number[];
      sellingPrices: number[];
      total_revenue: number;
      total_profit: number;
    };

    const aggregates = new Map<string, Aggregate>();

    for (const production of productions as ProductionRecord[]) {
      const lines = production.created_products ?? [];
      const totalCount = sumMoney(lines.map((line) => Number(line.count)));

      if (totalCount <= 0) {
        continue;
      }

      const batchTotal = Number(production.total_price);

      for (const line of lines) {
        const product = line.product;
        if (!product?.id) {
          continue;
        }

        const key = getProductKey(product);
        const quantity = Number(line.count);
        const lineCost = multiplyMoney(batchTotal, quantity / totalCount);
        const costPerUnit =
          quantity > 0 ? roundMoney(lineCost / quantity) : 0;

        const entry = aggregates.get(key) ?? {
          product_name: product.name,
          size: product.size ?? 'none',
          total_produced: 0,
          total_sold: 0,
          costPerUnits: [],
          sellingPrices: [],
          total_revenue: 0,
          total_profit: 0,
        };

        entry.total_produced += quantity;
        entry.costPerUnits.push(costPerUnit);
        aggregates.set(key, entry);
      }
    }

    for (const line of salesLines) {
      const product = line.product as ProductRef;
      const key = getProductKey(product);
      const entry = aggregates.get(key) ?? {
        product_name: product.name,
        size: product.size ?? 'none',
        total_produced: 0,
        total_sold: 0,
        costPerUnits: [],
        sellingPrices: [],
        total_revenue: 0,
        total_profit: 0,
      };

      const sellingPrice = Number(product.selling_price ?? 0);
      const quantitySold = Number(line.count);
      const revenue = multiplyMoney(quantitySold, sellingPrice);
      const avgCost = average(entry.costPerUnits);
      const profitPerUnit = roundMoney(sellingPrice - avgCost);

      entry.total_sold += quantitySold;
      entry.sellingPrices.push(sellingPrice);
      entry.total_revenue = sumMoney([entry.total_revenue, revenue]);
      entry.total_profit = sumMoney([
        entry.total_profit,
        multiplyMoney(profitPerUnit, quantitySold),
      ]);
      aggregates.set(key, entry);
    }

    return Array.from(aggregates.values()).map((entry) => {
      const avgCostPerUnit = average(entry.costPerUnits);
      const avgSellingPrice = average(entry.sellingPrices);
      const avgProfitPerUnit = roundMoney(avgSellingPrice - avgCostPerUnit);

      return {
        product_name: entry.product_name,
        size: entry.size,
        total_produced: entry.total_produced,
        total_sold: entry.total_sold,
        avg_cost_per_unit: avgCostPerUnit,
        avg_selling_price: avgSellingPrice,
        avg_profit_per_unit: avgProfitPerUnit,
        total_revenue: entry.total_revenue,
        total_profit: entry.total_profit,
      };
    });
  },
});

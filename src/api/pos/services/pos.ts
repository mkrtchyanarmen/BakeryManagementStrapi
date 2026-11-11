import type { Core } from '@strapi/strapi';

import { normalizeSalesRecordInput } from '../../sales-record/utils/normalize-sales-record';
import { getElectricityPrices } from '../../../utils/app-settings';
import {
  aggregateProducedProducts,
  aggregateSoldProducts,
  loadEndOfDayProductions,
  loadEndOfDaySoldProducts,
} from '../../../utils/end-of-day-calc';
import { getPreviousElectricityLog } from '../../../utils/electricity-log';
import { multiplyMoney, roundMoney, sumMoney } from '../../../utils/money';

const PRODUCT_UID = 'api::product.product';
const SALE_UID = 'api::pos-sale.pos-sale';
const SALES_RECORD_UID = 'api::sales-record.sales-record';
const CASH_DESK_UID = 'api::cash-desk-day.cash-desk-day';
const WITHDRAWAL_UID = 'api::cash-withdrawal.cash-withdrawal';
const PURCHASE_UID = 'api::ingredient-purchase.ingredient-purchase';
const TEMPLATE_UID = 'api::production-template.production-template';
const PRODUCTION_UID = 'api::production.production';
const FILLING_UID = 'api::filling.filling';
const INGREDIENT_UID = 'api::ingredient.ingredient';
const ELECTRICITY_UID = 'api::electricity-log.electricity-log';

export class PosError extends Error {}

type MediaFile = {
  url?: string;
  formats?: Record<string, { url?: string } | undefined> | null;
} | null;

type ProductRow = {
  id: number;
  documentId: string;
  name: string;
  selling_price: number | string;
  is_active?: boolean | null;
  image?: MediaFile;
};

type IngredientRef = {
  documentId: string;
  name?: string;
  price?: number | string;
  unit?: string | null;
};

type RecipeProduct = ProductRow & {
  specific_ingredients?: Array<{ usage: number; ingredient?: IngredientRef | null }>;
  filling_usage?: Array<{ count: number; filling?: { documentId: string } | null }>;
};

type FillingRow = {
  documentId: string;
  ingredients?: Array<{ count: number; ingredient?: IngredientRef | null }>;
};

type ShowUnit = 'bag' | 'kg' | 'gram' | null;

type TemplateRow = {
  documentId: string;
  type: string;
  split_count?: number | string | null;
  used_ingredients?: Array<{
    count: number;
    show_unit?: ShowUnit;
    ingredient?: IngredientRef | null;
  }>;
  created_products?: Array<{ count: number; product?: ProductRow | null }>;
};

type SaleLineRow = {
  quantity_sold: number | string;
  selling_price_snapshot?: number | string | null;
  line_revenue?: number | string | null;
  product?: ProductRow | null;
};

type SaleRow = {
  documentId: string;
  sold_at: string;
  total_price: number | string;
  payment_method: 'cash' | 'card';
  cash_received?: number | string | null;
  change_given?: number | string | null;
  items?: SaleLineRow[];
};

type WithdrawalRow = {
  documentId: string;
  taken_at: string;
  amount: number | string;
  purpose: 'home' | 'business';
  quantity?: number | string | null;
  note?: string | null;
  ingredient?: IngredientRef | null;
};

function imageUrl(image: MediaFile | undefined): string | null {
  if (!image) return null;
  return image.formats?.small?.url ?? image.formats?.thumbnail?.url ?? image.url ?? null;
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requirePositive(value: unknown, message: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new PosError(message);
  }
  return parsed;
}

function serializeProduct(product: ProductRow) {
  return {
    documentId: product.documentId,
    name: product.name,
    selling_price: Number(product.selling_price),
    image_url: imageUrl(product.image),
  };
}

function serializeWithdrawal(row: WithdrawalRow) {
  return {
    documentId: row.documentId,
    taken_at: row.taken_at,
    amount: Number(row.amount),
    purpose: row.purpose,
    quantity: toNumberOrNull(row.quantity),
    note: row.note ?? null,
    ingredient: row.ingredient
      ? {
          documentId: row.ingredient.documentId,
          name: row.ingredient.name ?? '—',
          unit: row.ingredient.unit ?? null,
        }
      : null,
  };
}

async function loadProductsByDocumentId(strapi: Core.Strapi, documentIds: string[]) {
  const rows = (await strapi.db.query(PRODUCT_UID).findMany({
    where: { documentId: { $in: documentIds } },
  })) as ProductRow[];

  return new Map(rows.map((row) => [row.documentId, row]));
}

/** Adds POS sale lines to the day's sales record so web reports stay complete. */
async function addToDailySalesRecord(
  strapi: Core.Strapi,
  date: string,
  lines: Array<{ productDocumentId: string; quantity: number }>,
) {
  const existing = await strapi.db.query(SALES_RECORD_UID).findOne({
    where: { date },
    populate: { sold_products: { populate: { product: true } } },
  });

  const counts = new Map<string, number>();
  for (const line of (existing?.sold_products ?? []) as Array<{
    count: number;
    product?: { documentId?: string } | null;
  }>) {
    const documentId = line.product?.documentId;
    if (!documentId) continue;
    counts.set(documentId, roundMoney((counts.get(documentId) ?? 0) + Number(line.count)));
  }
  for (const line of lines) {
    counts.set(
      line.productDocumentId,
      roundMoney((counts.get(line.productDocumentId) ?? 0) + line.quantity),
    );
  }

  const data: Record<string, unknown> = {
    date,
    sold_products: Array.from(counts.entries()).map(([documentId, count]) => ({
      count,
      product: documentId,
    })),
  };
  await normalizeSalesRecordInput(strapi, data);

  if (existing) {
    await strapi
      .documents(SALES_RECORD_UID as never)
      .update({ documentId: existing.documentId, data } as never);
  } else {
    await strapi.documents(SALES_RECORD_UID as never).create({ data } as never);
  }
}

async function loadRecipeProducts(strapi: Core.Strapi, documentIds: string[]) {
  const products = (await strapi.documents(PRODUCT_UID as never).findMany({
    filters: { documentId: { $in: documentIds } },
    populate: {
      specific_ingredients: { populate: { ingredient: true } },
      filling_usage: { populate: { filling: { fields: ['documentId'] } } },
    },
  } as never)) as unknown as RecipeProduct[];

  const fillingIds = Array.from(
    new Set(
      products.flatMap((product) =>
        (product.filling_usage ?? [])
          .map((line) => line.filling?.documentId)
          .filter((id): id is string => Boolean(id)),
      ),
    ),
  );

  const fillings = fillingIds.length
    ? ((await strapi.documents(FILLING_UID as never).findMany({
        status: 'published',
        filters: { documentId: { $in: fillingIds } },
        populate: { ingredients: { populate: { ingredient: true } } },
      } as never)) as unknown as FillingRow[])
    : [];

  return {
    products: new Map(products.map((product) => [product.documentId, product])),
    fillings: new Map(fillings.map((filling) => [filling.documentId, filling])),
  };
}

type IngredientUsage = { ingredient: IngredientRef; count: number; show_unit: ShowUnit };

function addUsage(
  usage: Map<string, IngredientUsage>,
  ingredient: IngredientRef | null | undefined,
  count: number,
  showUnit: ShowUnit = null,
) {
  if (!ingredient?.documentId || !(count > 0)) return;

  const existing = usage.get(ingredient.documentId);
  if (existing) {
    existing.count = Math.round((existing.count + count) * 1000) / 1000;
    if (showUnit && !existing.show_unit) existing.show_unit = showUnit;
    return;
  }

  usage.set(ingredient.documentId, {
    ingredient,
    count: Math.round(count * 1000) / 1000,
    show_unit: showUnit,
  });
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async getProducts() {
    const products = (await strapi.db.query(PRODUCT_UID).findMany({
      where: { is_active: { $ne: false } },
      populate: { image: true },
      orderBy: { name: 'asc' },
    })) as ProductRow[];

    return products.map(serializeProduct);
  },

  async createSale(input: {
    date: string;
    items: Array<{ product: string; quantity: number }>;
    payment_method: string;
    cash_received?: number | null;
    terminal_reference?: string | null;
    cashier?: string | null;
  }) {
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new PosError('Ավելացրեք առնվազն 1 ապրանք');
    }
    if (input.payment_method !== 'cash' && input.payment_method !== 'card') {
      throw new PosError('Անհայտ վճարման եղանակ');
    }

    const productsById = await loadProductsByDocumentId(
      strapi,
      input.items.map((item) => String(item.product)),
    );

    const lines = input.items.map((item) => {
      const product = productsById.get(String(item.product));
      if (!product) {
        throw new PosError('Ապրանքը չի գտնվել');
      }
      const quantity = requirePositive(item.quantity, 'Քանակը պետք է լինի 1 կամ ավելի');
      const price = Number(product.selling_price);

      return {
        productDocumentId: product.documentId,
        quantity,
        price,
        revenue: multiplyMoney(quantity, price),
      };
    });

    const totalPrice = sumMoney(lines.map((line) => line.revenue));
    let cashReceived: number | null = null;
    let changeGiven: number | null = null;

    if (input.payment_method === 'cash') {
      cashReceived = toNumberOrNull(input.cash_received) ?? totalPrice;
      if (cashReceived < totalPrice) {
        throw new PosError('Տրված գումարը պակաս է ընդհանուրից');
      }
      changeGiven = roundMoney(cashReceived - totalPrice);
    }

    const sale = await strapi.documents(SALE_UID as never).create({
      data: {
        date: input.date,
        sold_at: new Date().toISOString(),
        payment_method: input.payment_method,
        total_price: totalPrice,
        cash_received: cashReceived,
        change_given: changeGiven,
        terminal_reference: input.terminal_reference ?? null,
        cashier: input.cashier ?? null,
        items: lines.map((line) => ({
          product: line.productDocumentId,
          quantity_sold: line.quantity,
          selling_price_snapshot: line.price,
          line_revenue: line.revenue,
        })),
      },
    } as never);

    await addToDailySalesRecord(strapi, input.date, lines);

    return {
      documentId: (sale as { documentId: string }).documentId,
      total_price: totalPrice,
      payment_method: input.payment_method,
      cash_received: cashReceived,
      change_given: changeGiven,
    };
  },

  async getCashSummary(date: string) {
    const sales = (await strapi.db.query(SALE_UID).findMany({
      where: { date },
      populate: { items: { populate: { product: true } } },
      orderBy: { sold_at: 'desc' },
    })) as SaleRow[];

    const withdrawals = (await strapi.db.query(WITHDRAWAL_UID).findMany({
      where: { date },
      populate: { ingredient: true },
      orderBy: { taken_at: 'desc' },
    })) as WithdrawalRow[];

    const desk = await strapi.db.query(CASH_DESK_UID).findOne({ where: { date } });

    const productTotals = new Map<
      string,
      { name: string; quantity: number; cash_total: number; card_total: number }
    >();

    for (const sale of sales) {
      for (const line of sale.items ?? []) {
        const key = line.product?.documentId ?? 'unknown';
        const entry = productTotals.get(key) ?? {
          name: line.product?.name ?? '—',
          quantity: 0,
          cash_total: 0,
          card_total: 0,
        };
        const revenue = Number(line.line_revenue ?? 0);
        entry.quantity = roundMoney(entry.quantity + Number(line.quantity_sold));
        if (sale.payment_method === 'cash') {
          entry.cash_total = sumMoney([entry.cash_total, revenue]);
        } else {
          entry.card_total = sumMoney([entry.card_total, revenue]);
        }
        productTotals.set(key, entry);
      }
    }

    const cashSales = sales.filter((sale) => sale.payment_method === 'cash');
    const cardSales = sales.filter((sale) => sale.payment_method === 'card');
    const cashTotal = sumMoney(cashSales.map((sale) => Number(sale.total_price)));
    const cardTotal = sumMoney(cardSales.map((sale) => Number(sale.total_price)));
    const homeTotal = sumMoney(
      withdrawals.filter((row) => row.purpose === 'home').map((row) => Number(row.amount)),
    );
    const businessTotal = sumMoney(
      withdrawals
        .filter((row) => row.purpose === 'business')
        .map((row) => Number(row.amount)),
    );
    const openingCash = Number(desk?.opening_cash ?? 0);
    const workersCost = Number(desk?.workers_cost ?? 0);

    return {
      date,
      opening_cash: openingCash,
      workers_cost: workersCost,
      sales_count: sales.length,
      cash_sales_total: cashTotal,
      card_sales_total: cardTotal,
      sales_total: sumMoney([cashTotal, cardTotal]),
      withdrawals_home_total: homeTotal,
      withdrawals_business_total: businessTotal,
      expected_cash_in_desk: roundMoney(
        openingCash + cashTotal - homeTotal - businessTotal - workersCost,
      ),
      products_sold: Array.from(productTotals.values())
        .map((entry) => ({ ...entry, total: sumMoney([entry.cash_total, entry.card_total]) }))
        .sort((a, b) => b.quantity - a.quantity),
      withdrawals: withdrawals.map(serializeWithdrawal),
      electricity: await this.getElectricity(date),
    };
  },

  async upsertCashDesk(
    date: string,
    input: { opening_cash?: number | null; workers_cost?: number | null },
  ) {
    const data: Record<string, unknown> = {};
    if (input.opening_cash != null) data.opening_cash = Math.max(Number(input.opening_cash), 0);
    if (input.workers_cost != null) data.workers_cost = Math.max(Number(input.workers_cost), 0);

    const existing = await strapi.db.query(CASH_DESK_UID).findOne({ where: { date } });

    if (existing) {
      await strapi
        .documents(CASH_DESK_UID as never)
        .update({ documentId: existing.documentId, data } as never);
    } else {
      await strapi
        .documents(CASH_DESK_UID as never)
        .create({ data: { date, opening_cash: 0, workers_cost: 0, ...data } } as never);
    }

    return this.getCashSummary(date);
  },

  async getElectricity(date: string) {
    const prices = await getElectricityPrices(strapi);
    const log = await strapi.db.query(ELECTRICITY_UID).findOne({ where: { date } });
    const previous = await getPreviousElectricityLog(strapi, date, log?.id);

    return {
      documentId: log?.documentId ?? null,
      morning_reading: toNumberOrNull(log?.morning_reading),
      evening_reading: toNumberOrNull(log?.meter_reading),
      previous_evening_reading: toNumberOrNull(previous?.meter_reading),
      previous_date: previous?.date ? String(previous.date) : null,
      kwh_day: toNumberOrNull(log?.kwh_day),
      kwh_night: toNumberOrNull(log?.kwh_night),
      day_cost: toNumberOrNull(log?.day_cost),
      night_cost: toNumberOrNull(log?.night_cost),
      total_cost: toNumberOrNull(log?.total_cost),
      day_price_per_kwh: prices.day,
      night_price_per_kwh: prices.night,
    };
  },

  async upsertElectricity(
    date: string,
    input: { morning_reading?: number | null; evening_reading?: number | null },
  ) {
    const existing = await strapi.db.query(ELECTRICITY_UID).findOne({ where: { date } });
    const data: Record<string, unknown> = { date };
    if (input.morning_reading !== undefined) data.morning_reading = input.morning_reading;
    if (input.evening_reading !== undefined) data.meter_reading = input.evening_reading;

    // Computed fields are filled by the electricity-log lifecycles.
    if (existing) {
      await strapi
        .documents(ELECTRICITY_UID as never)
        .update({ documentId: existing.documentId, data } as never);
    } else {
      await strapi.documents(ELECTRICITY_UID as never).create({ data } as never);
    }

    return this.getElectricity(date);
  },

  async getTemplates() {
    const templates = (await strapi.documents(TEMPLATE_UID as never).findMany({
      status: 'published',
      sort: 'type:asc',
      populate: {
        created_products: { populate: { product: { populate: { image: true } } } },
      },
    } as never)) as unknown as TemplateRow[];

    return templates.map((template) => ({
      documentId: template.documentId,
      type: template.type,
      created_products: (template.created_products ?? [])
        .filter((line) => line.product)
        .map((line) => ({
          count: Number(line.count),
          product: serializeProduct(line.product as ProductRow),
        })),
    }));
  },

  async getProductions(date: string) {
    const productions = (await strapi.db.query(PRODUCTION_UID).findMany({
      where: { date },
      populate: {
        production_template: true,
        created_products: { populate: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    })) as Array<{
      documentId: string;
      total_price: number | string;
      production_template?: { type?: string } | null;
      created_products?: Array<{ count: number; product?: ProductRow | null }>;
    }>;

    return productions.map((production) => ({
      documentId: production.documentId,
      type: production.production_template?.type ?? '—',
      total_price: Number(production.total_price),
      created_products: (production.created_products ?? []).map((line) => ({
        count: Number(line.count),
        name: line.product?.name ?? '—',
      })),
    }));
  },

  /**
   * Same costing as the web production form (template ingredients × multiplier
   * plus product-specific and filling ingredients), but worker pay is 0 —
   * workers are paid from the cash desk instead.
   */
  async createProduction(input: {
    date: string;
    template: string;
    multiplier: number;
    created_products?: Array<{ product: string; count: number }>;
  }) {
    const multiplier = requirePositive(input.multiplier, 'Քանակը պետք է լինի 0-ից մեծ');

    const templates = (await strapi.documents(TEMPLATE_UID as never).findMany({
      status: 'published',
      filters: { documentId: input.template },
      populate: {
        used_ingredients: { populate: { ingredient: true } },
        created_products: { populate: { product: true } },
      },
    } as never)) as unknown as TemplateRow[];
    const template = templates[0];

    if (!template) {
      throw new PosError('Կաղապարը չի գտնվել');
    }

    const createdProducts = (
      input.created_products?.length
        ? input.created_products.map((line) => ({
            productDocumentId: String(line.product),
            count: Number(line.count),
          }))
        : (template.created_products ?? []).map((line) => ({
            productDocumentId: line.product?.documentId ?? '',
            count: Number(line.count) * multiplier,
          }))
    ).filter((line) => line.productDocumentId && line.count > 0);

    if (createdProducts.length === 0) {
      throw new PosError('Ավելացրեք առնվազն 1 ապրանք');
    }

    const recipe = await loadRecipeProducts(
      strapi,
      createdProducts.map((line) => line.productDocumentId),
    );

    const usage = new Map<string, IngredientUsage>();

    for (const line of template.used_ingredients ?? []) {
      addUsage(usage, line.ingredient, Number(line.count) * multiplier, line.show_unit ?? null);
    }

    let totalPrice = 0;

    for (const line of createdProducts) {
      const product = recipe.products.get(line.productDocumentId);
      if (!product) {
        throw new PosError('Ապրանքը չի գտնվել');
      }

      totalPrice += Number(product.selling_price) * line.count;

      for (const specific of product.specific_ingredients ?? []) {
        addUsage(usage, specific.ingredient, Number(specific.usage) * line.count);
      }

      for (const fillingLine of product.filling_usage ?? []) {
        const filling = fillingLine.filling?.documentId
          ? recipe.fillings.get(fillingLine.filling.documentId)
          : undefined;
        for (const ingredientLine of filling?.ingredients ?? []) {
          addUsage(
            usage,
            ingredientLine.ingredient,
            Number(ingredientLine.count) * Number(fillingLine.count) * line.count,
          );
        }
      }
    }

    const usedIngredients = Array.from(usage.values());

    if (usedIngredients.length === 0) {
      throw new PosError('Կաղապարում հումք չկա');
    }

    const ingredientsCost = Math.round(
      usedIngredients.reduce(
        (sum, line) => sum + Number(line.ingredient.price ?? 0) * line.count,
        0,
      ),
    );
    const roundedTotal = Math.round(totalPrice);

    const production = await strapi.documents(PRODUCTION_UID as never).create({
      data: {
        date: input.date,
        production_template: template.documentId,
        total_price: roundedTotal,
        production_price: 0,
        expected_income: roundedTotal - ingredientsCost,
        used_ingredients: usedIngredients.map((line) => ({
          count: line.count,
          ingredient: line.ingredient.documentId,
          show_unit: line.show_unit,
        })),
        created_products: createdProducts.map((line) => ({
          count: line.count,
          product: line.productDocumentId,
        })),
      },
    } as never);

    return {
      documentId: (production as { documentId: string }).documentId,
      total_price: roundedTotal,
      ingredients_cost: ingredientsCost,
    };
  },

  async getRemaining(date: string) {
    const productions = await loadEndOfDayProductions(strapi, date);
    const soldProducts = await loadEndOfDaySoldProducts(strapi, date);
    const produced = aggregateProducedProducts(productions);
    const sold = aggregateSoldProducts(soldProducts);

    const productsById = await strapi.db.query(PRODUCT_UID).findMany({
      where: { documentId: { $in: Array.from(produced.keys()) } },
      populate: { image: true },
    });
    const imageById = new Map(
      (productsById as ProductRow[]).map((row) => [row.documentId, imageUrl(row.image)]),
    );

    return Array.from(produced.values())
      .map((item) => {
        const quantitySold = sold.get(item.productDocumentId) ?? 0;
        return {
          documentId: item.productDocumentId,
          name: item.productName,
          image_url: imageById.get(item.productDocumentId) ?? null,
          produced: item.quantityProduced,
          sold: quantitySold,
          remaining: Math.max(roundMoney(item.quantityProduced - quantitySold), 0),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'hy'));
  },

  async getIngredients() {
    const ingredients = await strapi.db.query(INGREDIENT_UID).findMany({
      orderBy: { name: 'asc' },
    });

    return (ingredients as Array<IngredientRef & { default_count?: number | null }>).map(
      (row) => ({
        documentId: row.documentId,
        name: row.name ?? '—',
        unit: row.unit ?? null,
        price: Number(row.price ?? 0),
        default_count: Number(row.default_count ?? 1),
      }),
    );
  },

  /**
   * Business withdrawals also create a paid ingredient purchase with the
   * amount actually spent, so they appear in the monthly purchase summary.
   */
  async createWithdrawal(input: {
    date: string;
    amount: number;
    purpose: string;
    ingredient?: string | null;
    quantity?: number | null;
    note?: string | null;
    cashier?: string | null;
  }) {
    const amount = requirePositive(input.amount, 'Մուտքագրեք գումարը');

    if (input.purpose !== 'home' && input.purpose !== 'business') {
      throw new PosError('Ընտրեք նպատակը');
    }

    const takenAt = new Date().toISOString();
    let ingredientPurchaseDocumentId: string | null = null;
    let quantity: number | null = null;

    if (input.purpose === 'business') {
      if (!input.ingredient) {
        throw new PosError('Ընտրեք, թե ինչ եք գնել');
      }
      quantity = requirePositive(input.quantity ?? 1, 'Քանակը պետք է լինի 0-ից մեծ');

      const purchase = await strapi.documents(PURCHASE_UID as never).create({
        data: {
          purchased_at: takenAt,
          quantity,
          // `connect` form is what the purchase lifecycle can resolve.
          ingredient: { connect: [{ documentId: input.ingredient }] },
          total_price: amount,
          is_paid: true,
        },
      } as never);
      ingredientPurchaseDocumentId = (purchase as { documentId: string }).documentId;
    }

    await strapi.documents(WITHDRAWAL_UID as never).create({
      data: {
        date: input.date,
        taken_at: takenAt,
        amount,
        purpose: input.purpose,
        ingredient: input.purpose === 'business' ? input.ingredient : null,
        quantity,
        ingredient_purchase: ingredientPurchaseDocumentId,
        note: input.note ?? null,
        cashier: input.cashier ?? null,
      },
    } as never);

    return this.getCashSummary(input.date);
  },
});

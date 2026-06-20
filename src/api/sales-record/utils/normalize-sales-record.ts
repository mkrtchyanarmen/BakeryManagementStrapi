import type { Core } from '@strapi/strapi';

import { findOneByRef, getRelationRef } from '../../../utils/relations';
import { multiplyMoney, sumMoney } from '../../../utils/money';

type SoldProductInput = Record<string, unknown>;

async function getLineRevenue(strapi: Core.Strapi, line: SoldProductInput) {
  const productRef = getRelationRef(line.product as never);

  if (!productRef) {
    throw new Error('Product is required for sold product line.');
  }

  const product = await findOneByRef<{ id: number; selling_price: number }>(
    strapi,
    'api::product.product',
    productRef,
  );

  if (!product) {
    throw new Error('Product not found.');
  }

  const count = Number(line.count);

  if (count < 1) {
    throw new Error('Sold count must be at least 1.');
  }

  return multiplyMoney(count, Number(product.selling_price));
}

export async function normalizeSalesRecordInput(
  strapi: Core.Strapi,
  data: Record<string, unknown>,
) {
  const lines = (data.sold_products as SoldProductInput[] | undefined) ?? [];

  const soldLines = lines.filter((line) => Number(line.count) >= 1);

  if (soldLines.length === 0) {
    throw new Error('At least one sold product line is required.');
  }

  data.sold_products = soldLines;

  const lineRevenues = await Promise.all(
    soldLines.map((line) => getLineRevenue(strapi, line)),
  );

  data.total_price = sumMoney(lineRevenues);
}

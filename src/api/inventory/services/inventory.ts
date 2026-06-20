import { multiplyMoney, roundMoney, sumMoney } from '../../../utils/money';

type IngredientRef = {
  id: number;
  documentId: string;
  name: string;
  price: number;
  unit: string | null;
};

type StockAggregate = {
  ingredient: IngredientRef;
  total_purchased: number;
  total_used: number;
};

function getIngredientFromLine(
  line: { ingredient?: IngredientRef | null },
): IngredientRef | null {
  const ingredient = line.ingredient;
  if (!ingredient?.id) return null;
  return ingredient;
}

export default () => ({
  async getCurrentStock() {
    const ingredients = await strapi.db
      .query('api::ingredient.ingredient')
      .findMany({
        orderBy: { name: 'asc' },
      });

    const aggregates = new Map<number, StockAggregate>();

    for (const ingredient of ingredients) {
      aggregates.set(ingredient.id, {
        ingredient: {
          id: ingredient.id,
          documentId: ingredient.documentId,
          name: ingredient.name,
          price: Number(ingredient.price),
          unit: ingredient.unit ?? null,
        },
        total_purchased: 0,
        total_used: 0,
      });
    }

    const purchases = await strapi.db
      .query('api::ingredient-purchase.ingredient-purchase')
      .findMany({
        populate: { ingredient: true },
      });

    for (const purchase of purchases) {
      const ingredient = purchase.ingredient as IngredientRef | null;
      if (!ingredient?.id) continue;

      const entry = aggregates.get(ingredient.id) ?? {
        ingredient: {
          id: ingredient.id,
          documentId: ingredient.documentId,
          name: ingredient.name,
          price: Number(ingredient.price),
          unit: ingredient.unit ?? null,
        },
        total_purchased: 0,
        total_used: 0,
      };

      entry.total_purchased = sumMoney([
        entry.total_purchased,
        Number(purchase.quantity),
      ]);
      aggregates.set(ingredient.id, entry);
    }

    const productions = await strapi.db.query('api::production.production').findMany({
      populate: {
        used_ingredients: {
          populate: { ingredient: true },
        },
      },
    });

    for (const production of productions) {
      const lines = (production.used_ingredients ?? []) as Array<{
        count: number;
        ingredient?: IngredientRef | null;
      }>;

      for (const line of lines) {
        const ingredient = getIngredientFromLine(line);
        if (!ingredient) continue;

        const entry = aggregates.get(ingredient.id) ?? {
          ingredient,
          total_purchased: 0,
          total_used: 0,
        };

        entry.total_used = sumMoney([entry.total_used, Number(line.count)]);
        aggregates.set(ingredient.id, entry);
      }
    }

    const items = Array.from(aggregates.values())
      .map((entry) => {
        const remaining = roundMoney(
          entry.total_purchased - entry.total_used,
        );
        const pricePerUnit = entry.ingredient.price;
        const storeValue = multiplyMoney(
          Math.max(remaining, 0),
          pricePerUnit,
        );

        return {
          ingredient_id: entry.ingredient.id,
          documentId: entry.ingredient.documentId,
          name: entry.ingredient.name,
          unit: entry.ingredient.unit,
          price_per_unit: pricePerUnit,
          total_purchased: roundMoney(entry.total_purchased),
          total_used: roundMoney(entry.total_used),
          remaining,
          store_value: storeValue,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'hy'));

    const total_store_value = sumMoney(
      items.map((item) => item.store_value),
    );

    return {
      total_store_value: roundMoney(total_store_value),
      items,
    };
  },
});

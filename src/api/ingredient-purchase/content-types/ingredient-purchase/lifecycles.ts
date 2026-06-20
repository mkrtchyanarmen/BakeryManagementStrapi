import { getRelationRef } from '../../../../utils/relations';
import { multiplyMoney } from '../../../../utils/money';

async function loadIngredient(ref: string | number) {
  const isNumeric = typeof ref === 'number' || /^\d+$/.test(String(ref));

  return strapi.db.query('api::ingredient.ingredient').findOne({
    where: isNumeric ? { id: Number(ref) } : { documentId: String(ref) },
    populate: { supplier: true },
  });
}

async function applyPurchaseDefaults(data: Record<string, unknown>) {
  const ingredientRef = getRelationRef(data.ingredient as never);

  if (!ingredientRef) {
    throw new Error('Ingredient is required for purchase.');
  }

  const ingredient = await loadIngredient(ingredientRef);

  if (!ingredient) {
    throw new Error('Ingredient not found.');
  }

  if (data.quantity != null) {
    const computedTotal = multiplyMoney(
      Number(data.quantity),
      Number(ingredient.price),
    );

    data.total_price =
      data.total_price != null ? Number(data.total_price) : computedTotal;
  }

  if (!getRelationRef(data.supplier as never) && ingredient.supplier) {
    data.supplier = ingredient.supplier.id;
  }
}

export default {
  async beforeCreate(event: { params: { data: Record<string, unknown> } }) {
    await applyPurchaseDefaults(event.params.data);
  },

  async beforeUpdate(event: {
    params: { data: Record<string, unknown>; where: Record<string, unknown> };
  }) {
    const { data, where } = event.params;

    if (!('ingredient' in data) && !('quantity' in data)) {
      return;
    }

    if (!data.ingredient || data.quantity == null) {
      const existing = await strapi.db
        .query('api::ingredient-purchase.ingredient-purchase')
        .findOne({
          where,
          populate: { ingredient: true },
        });

      if (!existing) {
        return;
      }

      if (!data.ingredient && existing.ingredient) {
        data.ingredient = existing.ingredient.id;
      }

      if (data.quantity == null) {
        data.quantity = existing.quantity;
      }
    }

    await applyPurchaseDefaults(data);
  },
};

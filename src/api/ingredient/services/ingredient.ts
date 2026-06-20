import { factories } from '@strapi/strapi';

type SupplierSummary = {
  id: number;
  documentId: string;
  name: string;
} | null;

type IngredientForPurchase = {
  id: number;
  documentId: string;
  name: string;
  price: number;
  unit: string | null;
  conversion_factor_unit: string | null;
  conversion_factor: number | null;
  default_count: number;
  supplier: SupplierSummary;
};

export default factories.createCoreService(
  'api::ingredient.ingredient' as never,
  ({ strapi }) => ({
    async getWithPurchaseUnits(): Promise<IngredientForPurchase[]> {
      const ingredients = await strapi.db
        .query('api::ingredient.ingredient')
        .findMany({
          orderBy: { name: 'asc' },
          populate: { supplier: true },
        });

      return ingredients.map((ingredient) => ({
        id: ingredient.id,
        documentId: ingredient.documentId,
        name: ingredient.name,
        price: Number(ingredient.price),
        unit: ingredient.unit ?? null,
        conversion_factor_unit: ingredient.conversion_factor_unit ?? null,
        conversion_factor: ingredient.conversion_factor
          ? Number(ingredient.conversion_factor)
          : null,
        default_count: ingredient.default_count ?? 1,
        supplier: ingredient.supplier
          ? {
              id: ingredient.supplier.id,
              documentId: ingredient.supplier.documentId,
              name: ingredient.supplier.name,
            }
          : null,
      }));
    },
  }),
);

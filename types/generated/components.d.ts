import type { Schema, Struct } from '@strapi/strapi';

export interface CountComponentsCreatedProducts extends Struct.ComponentSchema {
  collectionName: 'components_count_components_created_products';
  info: {
    displayName: 'Created Products';
    icon: 'restaurant';
  };
  attributes: {
    count: Schema.Attribute.Decimal &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      >;
    product: Schema.Attribute.Relation<'oneToOne', 'api::product.product'>;
  };
}

export interface CountComponentsSalesProductLine
  extends Struct.ComponentSchema {
  collectionName: 'components_count_components_sales_product_lines';
  info: {
    displayName: 'Sales Product Line';
    icon: 'shopping-cart';
  };
  attributes: {
    line_revenue: Schema.Attribute.Decimal &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
    product: Schema.Attribute.Relation<'oneToOne', 'api::product.product'>;
    quantity_sold: Schema.Attribute.Decimal &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      >;
    selling_price_snapshot: Schema.Attribute.Decimal &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      > &
      Schema.Attribute.DefaultTo<0>;
  };
}

export interface CountComponentsUsedIngredients extends Struct.ComponentSchema {
  collectionName: 'components_count_components_used_ingredients';
  info: {
    displayName: 'Used Ingredients';
    icon: 'chartCircle';
  };
  attributes: {
    count: Schema.Attribute.Decimal & Schema.Attribute.Required;
    ingredient: Schema.Attribute.Relation<
      'oneToOne',
      'api::ingredient.ingredient'
    >;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'count-components.created-products': CountComponentsCreatedProducts;
      'count-components.sales-product-line': CountComponentsSalesProductLine;
      'count-components.used-ingredients': CountComponentsUsedIngredients;
    }
  }
}

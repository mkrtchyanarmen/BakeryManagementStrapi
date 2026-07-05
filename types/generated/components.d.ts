import type { Schema, Struct } from '@strapi/strapi';

export interface CountComponentsCreatedProducts extends Struct.ComponentSchema {
  collectionName: 'components_count_components_created_products';
  info: {
    displayName: 'Created Products';
    icon: 'restaurant';
  };
  attributes: {
    count: Schema.Attribute.Integer &
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

export interface CountComponentsProductIngredient
  extends Struct.ComponentSchema {
  collectionName: 'components_count_components_product_ingredients';
  info: {
    displayName: 'Product Ingredient';
  };
  attributes: {
    ingredient: Schema.Attribute.Relation<
      'oneToOne',
      'api::ingredient.ingredient'
    >;
    usage: Schema.Attribute.Float & Schema.Attribute.Required;
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
    count: Schema.Attribute.Float & Schema.Attribute.Required;
    ingredient: Schema.Attribute.Relation<
      'oneToOne',
      'api::ingredient.ingredient'
    >;
    show_unit: Schema.Attribute.Enumeration<['bag', 'kg', 'gram']>;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'count-components.created-products': CountComponentsCreatedProducts;
      'count-components.product-ingredient': CountComponentsProductIngredient;
      'count-components.sales-product-line': CountComponentsSalesProductLine;
      'count-components.used-ingredients': CountComponentsUsedIngredients;
    }
  }
}

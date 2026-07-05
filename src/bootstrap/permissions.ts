import type { Core } from '@strapi/strapi';

const CONTENT_TYPES = [
  'api::ingredient.ingredient',
  'api::ingredient-purchase.ingredient-purchase',
  'api::supplier.supplier',
  'api::product.product',
  'api::product-recipe.product-recipe',
  'api::production.production',
  'api::production-template.production-template',
  'api::inventory-movement.inventory-movement',
  'api::sales-record.sales-record',
  'api::daily-cash-report.daily-cash-report',
  'api::electricity-log.electricity-log',
] as const;

const SINGLE_TYPES = ['api::app-setting.app-setting'] as const;

const CRUD_ACTIONS = ['find', 'findOne', 'create', 'update', 'delete'] as const;

const CUSTOM_ACTIONS = [
  'api::inventory.inventory.getCurrent',
  'api::ingredient.ingredient.withPurchaseUnits',
  'api::report.report.daily',
  'api::report.report.profitByProduct',
  'api::report.report.monthly',
  'api::end-of-day.end-of-day.get',
  'api::app-setting.app-setting.electricityPrice',
] as const;

const OPERATOR_WRITE_TYPES = new Set<string>([
  'api::ingredient-purchase.ingredient-purchase',
  'api::production.production',
  'api::sales-record.sales-record',
  'api::daily-cash-report.daily-cash-report',
  'api::electricity-log.electricity-log',
]);

const OPERATOR_READ_TYPES = new Set<string>([
  'api::ingredient.ingredient',
  'api::supplier.supplier',
  'api::product.product',
  'api::production-template.production-template',
]);

const OPERATOR_SINGLE_TYPE_ACTIONS = new Set(['find']);

function contentTypeAction(uid: string, action: string): string {
  return `${uid}.${action}`;
}

async function setPermissionEnabled(
  strapi: Core.Strapi,
  roleId: number,
  action: string,
  enabled: boolean,
) {
  const permission = await strapi.db
    .query('plugin::users-permissions.permission')
    .findOne({
      where: {
        role: roleId,
        action,
      },
    });

  if (!permission) {
    return;
  }

  await strapi.db.query('plugin::users-permissions.permission').update({
    where: { id: permission.id },
    data: { enabled },
  });
}

async function ensureRole(
  strapi: Core.Strapi,
  name: string,
  type: string,
  description: string,
) {
  const existing = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type } });

  if (existing) {
    return existing;
  }

  return strapi.db.query('plugin::users-permissions.role').create({
    data: {
      name,
      description,
      type,
    },
  });
}

async function disableBakeryPermissionsForRole(
  strapi: Core.Strapi,
  roleId: number,
) {
  for (const uid of CONTENT_TYPES) {
    for (const action of CRUD_ACTIONS) {
      await setPermissionEnabled(
        strapi,
        roleId,
        contentTypeAction(uid, action),
        false,
      );
    }
  }

  for (const uid of SINGLE_TYPES) {
    await setPermissionEnabled(strapi, roleId, `${uid}.find`, false);
    await setPermissionEnabled(strapi, roleId, `${uid}.update`, false);
  }

  for (const action of CUSTOM_ACTIONS) {
    await setPermissionEnabled(strapi, roleId, action, false);
  }
}

async function enableAuthenticatedPermissions(
  strapi: Core.Strapi,
  roleId: number,
) {
  for (const uid of CONTENT_TYPES) {
    for (const action of CRUD_ACTIONS) {
      if (
        uid === 'api::inventory-movement.inventory-movement' &&
        (action === 'update' || action === 'delete')
      ) {
        await setPermissionEnabled(
          strapi,
          roleId,
          contentTypeAction(uid, action),
          false,
        );
        continue;
      }

      await setPermissionEnabled(
        strapi,
        roleId,
        contentTypeAction(uid, action),
        true,
      );
    }
  }

  for (const uid of SINGLE_TYPES) {
    await setPermissionEnabled(strapi, roleId, `${uid}.find`, true);
    await setPermissionEnabled(strapi, roleId, `${uid}.update`, true);
  }

  for (const action of CUSTOM_ACTIONS) {
    await setPermissionEnabled(strapi, roleId, action, true);
  }
}

async function enableAllBakeryPermissionsForRole(
  strapi: Core.Strapi,
  roleId: number,
) {
  for (const uid of CONTENT_TYPES) {
    for (const action of CRUD_ACTIONS) {
      await setPermissionEnabled(
        strapi,
        roleId,
        contentTypeAction(uid, action),
        true,
      );
    }
  }

  for (const uid of SINGLE_TYPES) {
    await setPermissionEnabled(strapi, roleId, `${uid}.find`, true);
    await setPermissionEnabled(strapi, roleId, `${uid}.update`, true);
  }

  for (const action of CUSTOM_ACTIONS) {
    await setPermissionEnabled(strapi, roleId, action, true);
  }
}

async function configureOperatorPermissions(
  strapi: Core.Strapi,
  roleId: number,
) {
  for (const uid of CONTENT_TYPES) {
    for (const action of CRUD_ACTIONS) {
      let enabled = false;

      if (OPERATOR_WRITE_TYPES.has(uid)) {
        enabled = true;
      } else if (
        OPERATOR_READ_TYPES.has(uid) &&
        (action === 'find' || action === 'findOne')
      ) {
        enabled = true;
      }

      await setPermissionEnabled(
        strapi,
        roleId,
        contentTypeAction(uid, action),
        enabled,
      );
    }
  }

  for (const uid of SINGLE_TYPES) {
    for (const action of ['find', 'update'] as const) {
      const enabled = OPERATOR_SINGLE_TYPE_ACTIONS.has(action);
      await setPermissionEnabled(strapi, roleId, `${uid}.${action}`, enabled);
    }
  }

  for (const action of CUSTOM_ACTIONS) {
    await setPermissionEnabled(strapi, roleId, action, true);
  }
}

export async function configureRolesAndPermissions(strapi: Core.Strapi) {
  const publicRole = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'public' } });

  const authenticatedRole = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'authenticated' } });

  const adminRole = await ensureRole(
    strapi,
    'Admin',
    'bakery-admin',
    'Full access to all bakery management resources',
  );

  const operatorRole = await ensureRole(
    strapi,
    'Operator',
    'bakery-operator',
    'Day-to-day bakery operations with restricted configuration access',
  );

  if (publicRole) {
    await disableBakeryPermissionsForRole(strapi, publicRole.id);
  }

  if (authenticatedRole) {
    await enableAuthenticatedPermissions(strapi, authenticatedRole.id);
  }

  await enableAllBakeryPermissionsForRole(strapi, adminRole.id);
  await configureOperatorPermissions(strapi, operatorRole.id);

  strapi.log.info('Bakery roles and permissions configured.');
}

import { applyElectricityLogDefaults } from '../../../../utils/electricity-log';

export default {
  async beforeCreate(event: { params: { data: Record<string, unknown> } }) {
    await applyElectricityLogDefaults(strapi, event.params.data);
  },

  async beforeUpdate(event: {
    params: { data: Record<string, unknown>; where: { id: number } };
  }) {
    const { data, where } = event.params;

    if (!('meter_reading' in data) && !('date' in data)) {
      return;
    }

    const existing = await strapi.db
      .query('api::electricity-log.electricity-log')
      .findOne({ where });

    if (!existing) {
      return;
    }

    const merged = {
      ...existing,
      ...data,
    };

    await applyElectricityLogDefaults(strapi, merged, where.id);

    data.kwh_used = merged.kwh_used;
    data.total_cost = merged.total_cost;
  },
};

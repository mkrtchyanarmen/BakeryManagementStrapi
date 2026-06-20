import { roundMoney, sumMoney } from '../../../../utils/money';

async function computeDailyCashReport(data: Record<string, unknown>) {
  data.total_entered = sumMoney([
    Number(data.cash_amount),
    Number(data.card_amount),
  ]);

  const salesRecords = await strapi.db
    .query('api::sales-record.sales-record')
    .findMany({
      where: { date: data.date },
    });

  data.total_from_sales = sumMoney(
    salesRecords.map(
      (record: { total_price: number }) => Number(record.total_price),
    ),
  );

  const productions = await strapi.db
    .query('api::production.production')
    .findMany({
      where: { date: data.date },
    });

  const productionPrice = sumMoney(
    productions.map(
      (production: { production_price: number }) =>
        Number(production.production_price),
    ),
  );
  const expectedCash = roundMoney(Number(data.total_from_sales) - productionPrice);

  data.difference = roundMoney(Number(data.total_entered) - expectedCash);
  data.is_balanced = Math.abs(Number(data.difference)) < 500;

  const electricityLog = await strapi.db
    .query('api::electricity-log.electricity-log')
    .findOne({
      where: { date: data.date },
    });

  if (electricityLog) {
    data.electricity_log = electricityLog.id;
  }
}

export default {
  async beforeCreate(event: { params: { data: Record<string, unknown> } }) {
    await computeDailyCashReport(event.params.data);
  },

  async beforeUpdate(event: { params: { data: Record<string, unknown> } }) {
    await computeDailyCashReport(event.params.data);
  },
};

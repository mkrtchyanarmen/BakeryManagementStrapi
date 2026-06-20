import { getAppSettings, getElectricityPricePerKwh } from '../../../utils/app-settings';
import {
  calculateEndOfDayBreakdown,
  loadEndOfDayProductions,
  loadEndOfDaySoldProducts,
} from '../../../utils/end-of-day-calc';
import {
  getPreviousElectricityLog,
  getPreviousReadingFromLog,
} from '../../../utils/electricity-log';
import { roundMoney, sumMoney } from '../../../utils/money';

export default () => ({
  async getEndOfDay(date: string) {
    const settings = await getAppSettings(strapi);
    const pricePerKwh = await getElectricityPricePerKwh(strapi);
    const previousLog = await getPreviousElectricityLog(strapi, date);

    const todayElectricity = await strapi.db
      .query('api::electricity-log.electricity-log')
      .findOne({
        where: { date },
      });

    const cashReport = await strapi.db
      .query('api::daily-cash-report.daily-cash-report')
      .findOne({
        where: { date },
      });

    const salesRecords = await strapi.db
      .query('api::sales-record.sales-record')
      .findMany({
        where: { date },
      });

    const totalRevenue = sumMoney(
      salesRecords.map(
        (record: { total_price: number }) => Number(record.total_price),
      ),
    );

    const electricityCost = todayElectricity
      ? Number(todayElectricity.total_cost)
      : null;

    const previousReading = previousLog
      ? Number(previousLog.meter_reading)
      : todayElectricity
        ? getPreviousReadingFromLog(
            previousLog,
            Number(todayElectricity.meter_reading),
          )
        : null;

    const productions = await loadEndOfDayProductions(strapi, date);
    const soldProducts = await loadEndOfDaySoldProducts(strapi, date);

    const breakdown = calculateEndOfDayBreakdown({
      date,
      settings: {
        rental_price: Number(settings?.rental_price ?? 0),
        counter_service_fee: Number(settings?.counter_service_fee ?? 0),
        mandatory_payment: Number(settings?.mandatory_payment ?? 0),
      },
      productions,
      soldProducts,
      totalRevenue,
      electricityCost,
    });

    return {
      date,
      settings: {
        rental_price: Number(settings?.rental_price ?? 0),
        counter_service_fee: Number(settings?.counter_service_fee ?? 0),
        mandatory_payment: Number(settings?.mandatory_payment ?? 0),
        electricity_price_per_kwh: pricePerKwh,
      },
      electricity: {
        id: todayElectricity ? Number(todayElectricity.id) : null,
        documentId: todayElectricity?.documentId ?? null,
        date,
        meter_reading: todayElectricity
          ? Number(todayElectricity.meter_reading)
          : null,
        previous_reading: previousReading,
        previous_date: previousLog ? String(previousLog.date) : null,
        kwh_used: todayElectricity ? Number(todayElectricity.kwh_used) : null,
        price_per_kwh: pricePerKwh,
        total_cost: electricityCost,
        is_entered: Boolean(todayElectricity),
      },
      cash: {
        id: cashReport ? Number(cashReport.id) : null,
        documentId: cashReport?.documentId ?? null,
        cash_amount: cashReport ? Number(cashReport.cash_amount) : null,
        card_amount: cashReport ? Number(cashReport.card_amount) : null,
        total_entered: cashReport ? Number(cashReport.total_entered) : null,
        total_from_sales: cashReport
          ? Number(cashReport.total_from_sales)
          : totalRevenue,
        expected_cash_card: breakdown.expected_cash_card,
        difference: cashReport
          ? roundMoney(
              Number(cashReport.total_entered) - breakdown.expected_cash_card,
            )
          : null,
        is_balanced: cashReport
          ? Math.abs(
              Number(cashReport.total_entered) - breakdown.expected_cash_card,
            ) < 500
          : null,
        is_entered: Boolean(cashReport),
      },
      costs: breakdown.costs,
      remaining_products: breakdown.remaining_products,
      unsold_products_value: breakdown.unsold_products_value,
      days_in_month: breakdown.days_in_month,
      summary: breakdown.summary,
    };
  },
});

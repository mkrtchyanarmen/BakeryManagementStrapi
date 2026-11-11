import { ELECTRICITY_READING_ERROR } from '../../../utils/electricity-log';
import { PosError } from '../services/pos';

type PosContext = {
  query: Record<string, string | undefined>;
  request: { body?: Record<string, unknown> };
  state: { user?: { username?: string } };
  badRequest: (message: string) => unknown;
  body: unknown;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pos() {
  return strapi.service('api::pos.pos');
}

function readDate(value: unknown): string | null {
  return typeof value === 'string' && DATE_PATTERN.test(value) ? value : null;
}

async function respond(ctx: PosContext, run: () => Promise<unknown>) {
  try {
    ctx.body = await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (error instanceof PosError || message === ELECTRICITY_READING_ERROR) {
      return ctx.badRequest(message);
    }
    throw error;
  }
}

function withDate(
  source: 'query' | 'body',
  handler: (ctx: PosContext, date: string, body: Record<string, unknown>) => Promise<unknown>,
) {
  return async (ctx: PosContext) => {
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const date = readDate(source === 'query' ? ctx.query.date : body.date);

    if (!date) {
      return ctx.badRequest('Parameter "date" is required (YYYY-MM-DD).');
    }

    return respond(ctx, () => handler(ctx, date, body));
  };
}

export default {
  async products(ctx: PosContext) {
    return respond(ctx, () => pos().getProducts());
  },

  createSale: withDate('body', (ctx, date, body) =>
    pos().createSale({
      date,
      items: body.items as never,
      payment_method: String(body.payment_method ?? ''),
      cash_received: body.cash_received as number | null,
      terminal_reference: (body.terminal_reference as string | null) ?? null,
      cashier: ctx.state.user?.username ?? null,
    }),
  ),

  cashSummary: withDate('query', (_ctx, date) => pos().getCashSummary(date)),

  updateCashDesk: withDate('body', (_ctx, date, body) =>
    pos().upsertCashDesk(date, {
      opening_cash: body.opening_cash as number | null,
      workers_cost: body.workers_cost as number | null,
      cashier_salary: body.cashier_salary as number | null,
      baker_salary: body.baker_salary as number | null,
      cook_salary: body.cook_salary as number | null,
      cook2_salary: body.cook2_salary as number | null,
    }),
  ),

  updateElectricity: withDate('body', (_ctx, date, body) =>
    pos().upsertElectricity(date, {
      morning_reading: body.morning_reading as number | null | undefined,
      evening_reading: body.evening_reading as number | null | undefined,
    }),
  ),

  async templates(ctx: PosContext) {
    return respond(ctx, () => pos().getTemplates());
  },

  productions: withDate('query', (_ctx, date) => pos().getProductions(date)),

  createProduction: withDate('body', (_ctx, date, body) =>
    pos().createProduction({
      date,
      template: String(body.template ?? ''),
      multiplier: Number(body.multiplier),
      split_pieces_used: body.split_pieces_used as number | null,
      created_products: body.created_products as never,
    }),
  ),

  remaining: withDate('query', (_ctx, date) => pos().getRemaining(date)),

  async ingredients(ctx: PosContext) {
    return respond(ctx, () => pos().getIngredients());
  },

  createWithdrawal: withDate('body', (ctx, date, body) =>
    pos().createWithdrawal({
      date,
      amount: Number(body.amount),
      purpose: String(body.purpose ?? ''),
      ingredient: (body.ingredient as string | null) ?? null,
      quantity: body.quantity as number | null,
      note: (body.note as string | null) ?? null,
      cashier: ctx.state.user?.username ?? null,
    }),
  ),
};

import {
  mercadoPagoChargeCostsQuerySchema,
  mercadoPagoChargeCostsSchema,
} from "@purosur/contracts";
import type { ZoneRulesSource } from "@purosur/domain";
import { readMercadoPagoChargeCosts } from "@purosur/domain/payments/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { sameOriginGuard } from "../sessions/backoffice-origin.js";
import {
  capabilityAccess,
  openSessionOf,
  registerRouteAccess,
  routeSessionSource,
} from "../sessions/route-access.js";
import { DrizzleMercadoPagoChargeCostsReader } from "./drizzle-mercado-pago-charge-costs-reader.js";

export interface MercadoPagoChargeCostsRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
  zoneRules: ZoneRulesSource;
}

export function registerMercadoPagoChargeCostsRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: MercadoPagoChargeCostsRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const sessionSource = routeSessionSource({ db: options.db, now });
  const reader = new DrizzleMercadoPagoChargeCostsReader(options.db);

  app.get(
    "/reports/mercado-pago-charge-costs",
    {
      preHandler: sameOriginGuard(options.backofficeOrigin),
      config: { access: capabilityAccess("mercado_pago_charge_costs"), sessionSource },
    },
    async (request, reply) => {
      const query = await readValidatedBody(
        reply,
        mercadoPagoChargeCostsQuerySchema,
        request.query,
      );
      if (!query) {
        return;
      }
      const report = await readMercadoPagoChargeCosts(
        { reader, clock: { now }, zoneRules: options.zoneRules },
        {
          locationId: openSessionOf(request).locationId,
          asked: { from: query.from, to: query.to },
        },
      );
      const figures = (entry: {
        grossAmount: number;
        feeAmount: number;
        financingFeeAmount: number;
        taxesAmount: number;
        netAmount: number;
      }) => ({
        gross_amount: entry.grossAmount,
        fee_amount: entry.feeAmount,
        financing_fee_amount: entry.financingFeeAmount,
        taxes_amount: entry.taxesAmount,
        net_amount: entry.netAmount,
      });
      const entry = (
        counted: Parameters<typeof figures>[0] & {
          chargesCount: number;
          pendingCount: number;
        },
      ) => ({
        charges_count: counted.chargesCount,
        pending_count: counted.pendingCount,
        ...figures(counted),
      });
      await reply.code(200).send(
        mercadoPagoChargeCostsSchema.parse({
          range: report.range,
          charges: report.charges.map((charge) => ({
            payment_transaction_id: charge.paymentTransactionId,
            sale_id: charge.saleId,
            method: charge.method,
            register_id: charge.registerId,
            register_name: charge.registerName,
            amount: charge.amount,
            charged_at: charge.chargedAt.toISOString(),
            cost: charge.cost && {
              ...figures(charge.cost),
              money_release_date: charge.cost.moneyReleaseDate?.toISOString() ?? null,
            },
          })),
          days: report.days.map(({ day, ...counted }) => ({ day, ...entry(counted) })),
          months: report.months.map(({ month, ...counted }) => ({ month, ...entry(counted) })),
          methods: report.methods.map(({ method, ...counted }) => ({ method, ...entry(counted) })),
          registers: report.registers.map(({ registerId, registerName, ...counted }) => ({
            register_id: registerId,
            register_name: registerName,
            ...entry(counted),
          })),
          totals: entry(report.totals),
        }),
      );
    },
  );
}

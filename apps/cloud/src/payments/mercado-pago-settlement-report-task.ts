import type { ZoneRulesSource } from "@purosur/domain";
import {
  followMercadoPagoSettlementReport,
  type MercadoPagoSettlementReports,
} from "@purosur/domain/payments/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { BackgroundJobs } from "../platform/background-jobs.js";
import { DrizzleSettlementReportStore } from "./drizzle-settlement-report-store.js";

export const MERCADO_PAGO_SETTLEMENT_REPORT_TASK_IDENTIFIER = "mercado-pago-settlement-report";

const MERCADO_PAGO_SETTLEMENT_REPORT_CRONTAB_LINE = `0 * * * * ${MERCADO_PAGO_SETTLEMENT_REPORT_TASK_IDENTIFIER}`;

export interface MercadoPagoSettlementReportInput<TQueryResult extends PgQueryResultHKT> {
  now: () => Date;
  reports: MercadoPagoSettlementReports;
  db: PgDatabase<TQueryResult>;
  zoneRules: ZoneRulesSource;
}

export function mercadoPagoSettlementReportJobs<TQueryResult extends PgQueryResultHKT>({
  now,
  reports,
  db,
  zoneRules,
}: MercadoPagoSettlementReportInput<TQueryResult>): BackgroundJobs {
  return {
    taskList: {
      [MERCADO_PAGO_SETTLEMENT_REPORT_TASK_IDENTIFIER]: async (_payload, helpers) => {
        const outcome = await followMercadoPagoSettlementReport({
          reports,
          store: new DrizzleSettlementReportStore(db),
          clock: { now },
          zoneRules,
        });
        helpers.logger.info(`Mercado Pago settlement report: ${outcome.kind}`);
      },
    },
    crontab: [MERCADO_PAGO_SETTLEMENT_REPORT_CRONTAB_LINE],
  };
}

import { isPointOfSaleNumber } from "@purosur/domain";
import {
  recordTaxAuthorityLastAuthorized,
  type TaxAuthorityLastAuthorizedLookup,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import { type BackgroundJobs, databaseOfClient } from "../platform/background-jobs.js";
import { DrizzleTaxAuthorityCounts } from "./drizzle-tax-authority-counts.js";
import { DrizzleWsaaTokenSource } from "./drizzle-wsaa-token-source.js";
import { WSFE_SERVICE } from "./wsaa-token-renewal-task.js";

export const TAX_AUTHORITY_COUNT_TASK_IDENTIFIER = "tax-authority-last-authorized-count";

export interface TaxAuthorityCountInput {
  now: () => Date;
  taxAuthority: TaxAuthorityLastAuthorizedLookup;
  certificateFingerprint: string;
}

export interface TaxAuthorityCountJobsDeps {
  createDatabase?: (client: PoolClient) => PgDatabase<PgQueryResultHKT>;
}

function pointOfSaleOf(payload: unknown): number {
  const pointOfSale =
    typeof payload === "object" && payload !== null
      ? (payload as { pointOfSale?: unknown }).pointOfSale
      : undefined;
  if (typeof pointOfSale !== "number" || !isPointOfSaleNumber(pointOfSale)) {
    throw new Error("the job names no point of sale");
  }
  return pointOfSale;
}

export function taxAuthorityCountJobs(
  { now, taxAuthority, certificateFingerprint }: TaxAuthorityCountInput,
  deps: TaxAuthorityCountJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  return {
    taskList: {
      [TAX_AUTHORITY_COUNT_TASK_IDENTIFIER]: async (payload, helpers) => {
        const pointOfSale = pointOfSaleOf(payload);
        const outcome = await helpers.withPgClient((client) => {
          const db = doCreateDatabase(client);
          return recordTaxAuthorityLastAuthorized(
            {
              tokens: new DrizzleWsaaTokenSource(db, { now }, WSFE_SERVICE, certificateFingerprint),
              taxAuthority,
              counts: new DrizzleTaxAuthorityCounts(db),
              clock: { now },
            },
            { pointOfSale },
          );
        });
        if (outcome.kind !== "recorded") {
          throw new Error(
            `the tax authority's last authorized number of point of sale ${pointOfSale} was not read: ${outcome.kind}`,
          );
        }
      },
    },
    crontab: [],
  };
}

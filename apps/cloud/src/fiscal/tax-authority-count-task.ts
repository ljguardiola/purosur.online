import {
  CREDIT_NOTE_C_DOCUMENT_TYPE,
  FACTURA_C_DOCUMENT_TYPE,
  type FiscalTaskDocumentType,
  isPointOfSaleNumber,
} from "@purosur/domain";
import {
  assignAwaitedOfflineNumberBlock,
  recordTaxAuthorityLastAuthorized,
  type TaxAuthorityLastAuthorizedLookup,
  type TaxAuthorityVoucherLookup,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import { type BackgroundJobs, databaseOfClient } from "../platform/background-jobs.js";
import { DrizzleRegisterOfflinePointOfSaleStore } from "./drizzle-register-offline-point-of-sale-store.js";
import { DrizzleTaxAuthorityCounts } from "./drizzle-tax-authority-counts.js";
import { DrizzleWsaaTokenSource } from "./drizzle-wsaa-token-source.js";
import { WSFE_SERVICE } from "./wsaa-token-renewal-task.js";

export const TAX_AUTHORITY_COUNT_TASK_IDENTIFIER = "tax-authority-last-authorized-count";

export interface TaxAuthorityCountInput {
  now: () => Date;
  taxAuthority: TaxAuthorityLastAuthorizedLookup;
  vouchers: TaxAuthorityVoucherLookup;
  certificateFingerprint: string;
}

export interface TaxAuthorityCountJobsDeps {
  createDatabase?: (client: PoolClient) => PgDatabase<PgQueryResultHKT>;
}

function seriesOf(payload: unknown): {
  pointOfSale: number;
  documentType: FiscalTaskDocumentType;
} {
  const { pointOfSale, documentType } =
    typeof payload === "object" && payload !== null
      ? (payload as { pointOfSale?: unknown; documentType?: unknown })
      : { pointOfSale: undefined, documentType: undefined };
  if (typeof pointOfSale !== "number" || !isPointOfSaleNumber(pointOfSale)) {
    throw new Error("the job names no point of sale");
  }
  if (documentType !== FACTURA_C_DOCUMENT_TYPE && documentType !== CREDIT_NOTE_C_DOCUMENT_TYPE) {
    throw new Error("the job names no known document type");
  }
  return { pointOfSale, documentType };
}

export function taxAuthorityCountJobs(
  { now, taxAuthority, vouchers, certificateFingerprint }: TaxAuthorityCountInput,
  deps: TaxAuthorityCountJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  return {
    taskList: {
      [TAX_AUTHORITY_COUNT_TASK_IDENTIFIER]: async (payload, helpers) => {
        const { pointOfSale, documentType } = seriesOf(payload);
        await helpers.withPgClient(async (client) => {
          const db = doCreateDatabase(client);
          const outcome = await recordTaxAuthorityLastAuthorized(
            {
              tokens: new DrizzleWsaaTokenSource(db, { now }, WSFE_SERVICE, certificateFingerprint),
              taxAuthority,
              vouchers,
              counts: new DrizzleTaxAuthorityCounts(db),
              clock: { now },
            },
            { pointOfSale, documentType },
          );
          if (outcome.kind !== "recorded") {
            throw new Error(
              `the tax authority's last authorized ${documentType} number of point of sale ${pointOfSale} was not read: ${outcome.kind}`,
            );
          }
          await assignAwaitedOfflineNumberBlock(
            new DrizzleRegisterOfflinePointOfSaleStore(db, now),
            { pointOfSaleNumber: pointOfSale, documentType },
          );
        });
      },
    },
    crontab: [],
  };
}

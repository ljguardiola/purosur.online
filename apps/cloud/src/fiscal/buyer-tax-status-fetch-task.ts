import { nextBuyerTaxStatusFetchAt } from "@purosur/domain";
import {
  type BuyerTaxStatusSource,
  fetchBuyerTaxStatusSet,
} from "@purosur/domain/fiscal/use-cases";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { WorkerUtils } from "graphile-worker";
import type { PoolClient } from "pg";
import { type BackgroundJobs, databaseOfClient } from "../platform/background-jobs.js";
import { DrizzleBuyerTaxStatusStore } from "./drizzle-buyer-tax-status-store.js";
import { DrizzleWsaaTokenReader } from "./drizzle-wsaa-token-reader.js";
import { WSFE_SERVICE } from "./wsaa-token-renewal-task.js";

export const BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER = "buyer-tax-status-fetch";
export const BUYER_TAX_STATUS_FETCH_WATCHDOG_TASK_IDENTIFIER = "buyer-tax-status-fetch-watchdog";

const BUYER_TAX_STATUS_FETCH_WATCHDOG_CRONTAB_LINE = `* * * * * ${BUYER_TAX_STATUS_FETCH_WATCHDOG_TASK_IDENTIFIER}`;

export interface BuyerTaxStatusFetchInput {
  now: () => Date;
  source: BuyerTaxStatusSource;
  certificateFingerprint: string;
}

function fetchBuyerTaxStatusSetTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { now, source, certificateFingerprint }: BuyerTaxStatusFetchInput,
) {
  return fetchBuyerTaxStatusSet(
    {
      tokens: new DrizzleWsaaTokenReader(db),
      source,
      store: new DrizzleBuyerTaxStatusStore(db),
      clock: { now },
    },
    { service: WSFE_SERVICE, certificateFingerprint },
  );
}

export interface BuyerTaxStatusFetchJobsDeps {
  createDatabase?: (client: PoolClient) => NodePgDatabase<Record<string, never>>;
  fetch?: typeof fetchBuyerTaxStatusSetTask;
}

export function buyerTaxStatusFetchJobs(
  options: BuyerTaxStatusFetchInput,
  deps: BuyerTaxStatusFetchJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const doFetch = deps.fetch ?? fetchBuyerTaxStatusSetTask;
  return {
    taskList: {
      [BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER]: async (_payload, helpers) => {
        let nextFetchAt: Date | undefined;
        try {
          ({ nextFetchAt } = await helpers.withPgClient((client) =>
            doFetch(doCreateDatabase(client), options),
          ));
        } finally {
          await helpers.addJob(
            BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER,
            {},
            {
              jobKey: BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER,
              jobKeyMode: "replace",
              runAt: nextFetchAt ?? nextBuyerTaxStatusFetchAt({ gotSet: false }, options.now()),
            },
          );
        }
      },
      [BUYER_TAX_STATUS_FETCH_WATCHDOG_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.addJob(
          BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER,
          {},
          { jobKey: BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER, jobKeyMode: "preserve_run_at" },
        );
      },
    },
    crontab: [BUYER_TAX_STATUS_FETCH_WATCHDOG_CRONTAB_LINE],
  };
}

export function enqueueBuyerTaxStatusFetch(
  workerUtils: Pick<WorkerUtils, "addJob">,
): Promise<unknown> {
  return workerUtils.addJob(
    BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER,
    {},
    { jobKey: BUYER_TAX_STATUS_FETCH_TASK_IDENTIFIER, jobKeyMode: "replace" },
  );
}

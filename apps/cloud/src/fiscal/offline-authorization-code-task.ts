import { argentinaCalendarDay } from "@purosur/domain";
import {
  currentFortnightCodeAfterObtaining,
  obtainOfflineAuthorizationCodes,
  type TaxAuthorityOfflineAuthorizationCodes,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import { type BackgroundJobs, databaseOfClient } from "../platform/background-jobs.js";
import { DrizzleOfflineAuthorizationCodeStore } from "./drizzle-offline-authorization-code-store.js";
import { DrizzleWsaaTokenSource } from "./drizzle-wsaa-token-source.js";
import { WSFE_SERVICE } from "./wsaa-token-renewal-task.js";

export const OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER = "offline-authorization-code-acquisition";

export const OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER =
  "offline-authorization-code-request";

const OFFLINE_AUTHORIZATION_CODE_CRONTAB_LINE = `*/10 * * * * ${OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER}`;

export interface OfflineAuthorizationCodeInput {
  now: () => Date;
  taxAuthority: TaxAuthorityOfflineAuthorizationCodes;
  certificateFingerprint: string;
}

export interface OfflineAuthorizationCodeJobsDeps {
  createDatabase?: (client: PoolClient) => PgDatabase<PgQueryResultHKT>;
}

export function offlineAuthorizationCodeJobs(
  { now, taxAuthority, certificateFingerprint }: OfflineAuthorizationCodeInput,
  deps: OfflineAuthorizationCodeJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const obtain = (client: PoolClient) => {
    const db = doCreateDatabase(client);
    return obtainOfflineAuthorizationCodes({
      store: new DrizzleOfflineAuthorizationCodeStore(db),
      tokens: new DrizzleWsaaTokenSource(db, { now }, WSFE_SERVICE, certificateFingerprint),
      taxAuthority,
      clock: { now },
    });
  };
  return {
    taskList: {
      [OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient(obtain);
      },
      // Failing while the code is still missing is what makes the worker retry with its backoff.
      [OFFLINE_AUTHORIZATION_CODE_REQUEST_TASK_IDENTIFIER]: async (_payload, helpers) => {
        const outcome = await helpers.withPgClient(obtain);
        if (
          currentFortnightCodeAfterObtaining(outcome, argentinaCalendarDay(now())) === "missing"
        ) {
          throw new Error("the current fortnight's offline authorization code is still missing");
        }
      },
    },
    crontab: [OFFLINE_AUTHORIZATION_CODE_CRONTAB_LINE],
  };
}

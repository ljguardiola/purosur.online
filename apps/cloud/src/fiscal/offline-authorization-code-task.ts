import {
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
  return {
    taskList: {
      [OFFLINE_AUTHORIZATION_CODE_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient((client) => {
          const db = doCreateDatabase(client);
          return obtainOfflineAuthorizationCodes({
            store: new DrizzleOfflineAuthorizationCodeStore(db),
            tokens: new DrizzleWsaaTokenSource(db, { now }, WSFE_SERVICE, certificateFingerprint),
            taxAuthority,
            clock: { now },
          });
        });
      },
    },
    crontab: [OFFLINE_AUTHORIZATION_CODE_CRONTAB_LINE],
  };
}

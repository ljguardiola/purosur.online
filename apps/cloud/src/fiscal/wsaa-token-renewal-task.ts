import { renewWsaaToken, type WsaaAuthentication } from "@purosur/domain/fiscal/use-cases";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PoolClient } from "pg";
import { type BackgroundJobs, databaseOfClient } from "../platform/background-jobs.js";
import { DrizzleWsaaTokenStore } from "./drizzle-wsaa-token-store.js";

export const WSAA_TOKEN_RENEWAL_TASK_IDENTIFIER = "wsaa-token-renewal";

const WSAA_TOKEN_RENEWAL_CRONTAB_LINE = `* * * * * ${WSAA_TOKEN_RENEWAL_TASK_IDENTIFIER}`;

const WSFE_SERVICE = "wsfe";

export interface WsaaTokenRenewalInput {
  now: () => Date;
  authentication: WsaaAuthentication;
  certificateFingerprint: string;
}

interface WsaaTokenRenewalTaskInput extends WsaaTokenRenewalInput {
  service: string;
}

function renewWsaaTokenTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { now, authentication, service, certificateFingerprint }: WsaaTokenRenewalTaskInput,
) {
  return renewWsaaToken(
    { store: new DrizzleWsaaTokenStore(db), authentication, clock: { now } },
    { service, certificateFingerprint },
  );
}

export interface WsaaTokenRenewalJobsDeps {
  createDatabase?: (client: PoolClient) => NodePgDatabase<Record<string, never>>;
  renew?: typeof renewWsaaTokenTask;
}

export function wsaaTokenRenewalJobs(
  options: WsaaTokenRenewalInput,
  deps: WsaaTokenRenewalJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const doRenew = deps.renew ?? renewWsaaTokenTask;
  return {
    taskList: {
      [WSAA_TOKEN_RENEWAL_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient((client) =>
          doRenew(doCreateDatabase(client), { ...options, service: WSFE_SERVICE }),
        );
      },
    },
    crontab: [WSAA_TOKEN_RENEWAL_CRONTAB_LINE],
  };
}

import { checkArcaCertificateExpiry } from "@purosur/domain/fiscal/use-cases";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { WorkerUtils } from "graphile-worker";
import type { PoolClient } from "pg";
import { type BackgroundJobs, databaseOfClient } from "../platform/background-jobs.js";
import { DrizzleArcaCertificateExpiryStore } from "./drizzle-arca-certificate-expiry-store.js";

export const ARCA_CERTIFICATE_EXPIRY_CHECK_TASK_IDENTIFIER = "arca-certificate-expiry-check";

const ARCA_CERTIFICATE_EXPIRY_CHECK_CRONTAB_LINE = `15 3 * * * ${ARCA_CERTIFICATE_EXPIRY_CHECK_TASK_IDENTIFIER}`;

export interface ArcaCertificateExpiryCheckInput {
  now: () => Date;
  environment: string;
  notAfter: Date;
}

function checkArcaCertificateExpiryTask<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { now, environment, notAfter }: ArcaCertificateExpiryCheckInput,
) {
  return checkArcaCertificateExpiry(
    { store: new DrizzleArcaCertificateExpiryStore(db), clock: { now } },
    { environment, notAfter },
  );
}

export interface ArcaCertificateExpiryJobsDeps {
  createDatabase?: (client: PoolClient) => NodePgDatabase<Record<string, never>>;
  check?: typeof checkArcaCertificateExpiryTask;
}

export function arcaCertificateExpiryJobs(
  options: ArcaCertificateExpiryCheckInput,
  deps: ArcaCertificateExpiryJobsDeps = {},
): BackgroundJobs {
  const doCreateDatabase = deps.createDatabase ?? databaseOfClient;
  const doCheck = deps.check ?? checkArcaCertificateExpiryTask;
  return {
    taskList: {
      [ARCA_CERTIFICATE_EXPIRY_CHECK_TASK_IDENTIFIER]: async (_payload, helpers) => {
        await helpers.withPgClient((client) => doCheck(doCreateDatabase(client), options));
      },
    },
    crontab: [ARCA_CERTIFICATE_EXPIRY_CHECK_CRONTAB_LINE],
  };
}

export function enqueueArcaCertificateExpiryCheck(
  workerUtils: Pick<WorkerUtils, "addJob">,
): Promise<unknown> {
  return workerUtils.addJob(
    ARCA_CERTIFICATE_EXPIRY_CHECK_TASK_IDENTIFIER,
    {},
    { jobKey: ARCA_CERTIFICATE_EXPIRY_CHECK_TASK_IDENTIFIER },
  );
}

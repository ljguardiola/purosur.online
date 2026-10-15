import {
  cloudError,
  cloudErrorStatus,
  type OffsiteDumpCheckRecorded,
  offsiteDumpCheckRecordedSchema,
  offsiteDumpCheckReportSchema,
} from "@purosur/contracts";
import { recordOffsiteDumpCheck } from "@purosur/domain/backups/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { OFFSITE_DUMP_CHECK_ACCESS, registerRouteAccess } from "../sessions/route-access.js";
import { DrizzleOffsiteDumpCheckStore } from "./drizzle-offsite-dump-check-store.js";

export interface RecordOffsiteDumpCheckRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  offsiteDumpCheckToken: string | undefined;
  now: () => Date;
}

export function registerRecordOffsiteDumpCheckRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RecordOffsiteDumpCheckRouteOptions<TQueryResult>,
): void {
  registerRouteAccess(app);
  const store = new DrizzleOffsiteDumpCheckStore(options.db, options.now);

  app.post(
    "/backups/offsite-dump-checks",
    {
      config: {
        access: OFFSITE_DUMP_CHECK_ACCESS,
        offsiteDumpCheckToken: options.offsiteDumpCheckToken,
      },
    },
    async (request, reply) => {
      const report = offsiteDumpCheckReportSchema.safeParse(request.body);
      if (!report.success) {
        await reply
          .code(cloudErrorStatus("validation_failed"))
          .send(
            cloudError(
              "validation_failed",
              report.error.issues.map((issue) => issue.message).join("; "),
            ),
          );
        return;
      }
      const { night, ...check } = report.data;
      const outcome = await recordOffsiteDumpCheck({ store }, { night, check });
      const body: OffsiteDumpCheckRecorded =
        outcome.kind === "verified"
          ? { night: outcome.night, status: "verified", sizeBytes: outcome.sizeBytes }
          : { night: outcome.night, status: "failed", reason: outcome.reason };
      await reply.send(offsiteDumpCheckRecordedSchema.parse(body));
    },
  );
}

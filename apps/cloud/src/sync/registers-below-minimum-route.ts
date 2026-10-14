import {
  cloudError,
  cloudErrorStatus,
  registersBelowMinimumQuerySchema,
  registersBelowMinimumSchema,
} from "@purosur/contracts";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { RELEASE_CHECK_ACCESS, registerRouteAccess } from "../sessions/route-access.js";
import { DrizzleInstallationsLeftBehindReader } from "./drizzle-installations-left-behind-reader.js";

export interface RegistersBelowMinimumRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  releaseCheckToken: string | undefined;
}

export function registerRegistersBelowMinimumRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RegistersBelowMinimumRouteOptions<TQueryResult>,
): void {
  registerRouteAccess(app);
  const reader = new DrizzleInstallationsLeftBehindReader(options.db);

  app.get(
    "/sync/registers-below-minimum",
    {
      config: { access: RELEASE_CHECK_ACCESS, releaseCheckToken: options.releaseCheckToken },
    },
    async (request, reply) => {
      const query = registersBelowMinimumQuerySchema.safeParse(request.query);
      if (!query.success) {
        await reply
          .code(cloudErrorStatus("validation_failed"))
          .send(cloudError("validation_failed", "minimum must be a version of the form X.Y.Z"));
        return;
      }
      const installations = await reader.installationsLeftBehindBy(query.data.minimum);
      await reply.send(
        registersBelowMinimumSchema.parse({
          registers: installations.map(({ registerName, appVersion }) => ({
            register_name: registerName,
            app_version: appVersion,
          })),
        }),
      );
    },
  );
}

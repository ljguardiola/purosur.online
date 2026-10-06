import {
  cloudError,
  cloudErrorStatus,
  deviceEnrollmentBodySchema,
  deviceEnrollmentSchema,
} from "@purosur/contracts";
import { enrollInstallation } from "@purosur/domain/register/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { resolveSourceAddress } from "../access/recovery-source-address.js";
import { PUBLIC_ACCESS } from "../access/route-access.js";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { answerErrorsWithCloudEnvelope } from "./cloud-error-handler.js";
import { issueDeviceToken } from "./device-token.js";
import { DrizzleRegisterStore } from "./drizzle-register-store.js";
import { generateInstallationKey } from "./installation-key.js";
import { installationKeyCipher } from "./installation-key-cipher.js";
import { installationKeysBody } from "./installation-keys-body.js";
import { registerEnrollmentCodeMatches } from "./register-enrollment-code.js";

export interface DeviceEnrollmentRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  keysEncryptionKey: Uint8Array;
  now: () => Date;
}

const CODE_REJECTED = cloudError(
  "enrollment_code_rejected",
  "the enrollment code is expired, already used or burned by failed attempts",
);

export function registerDeviceEnrollmentRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: DeviceEnrollmentRouteOptions<TQueryResult>,
): void {
  const ports = {
    store: new DrizzleRegisterStore(options.db, installationKeyCipher(options.keysEncryptionKey)),
    clock: { now: options.now },
    tokens: { issue: issueDeviceToken },
    codes: { matches: registerEnrollmentCodeMatches },
    keys: { generate: generateInstallationKey },
  };

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.post("/devices", { config: { access: PUBLIC_ACCESS } }, async (request, reply) => {
      const body = await readValidatedBody(reply, deviceEnrollmentBodySchema, request.body);
      if (!body) {
        return;
      }

      const outcome = await enrollInstallation(ports, {
        code: body.code,
        sourceAddress: resolveSourceAddress(request),
        hostname: body.hostname,
        windowsVersion: body.windows_version,
      });

      if (outcome.kind === "rate_limited") {
        await reply
          .code(cloudErrorStatus("rate_limited"))
          .header("Retry-After", String(outcome.retryAfterSeconds))
          .send(
            cloudError("rate_limited", "too many enrollment attempts", [
              { retry_after_seconds: outcome.retryAfterSeconds },
            ]),
          );
        return;
      }
      if (outcome.kind === "code_rejected") {
        await reply.code(cloudErrorStatus(CODE_REJECTED.code)).send(CODE_REJECTED);
        return;
      }

      await reply.code(200).send(
        deviceEnrollmentSchema.parse({
          device_id: outcome.deviceId,
          device_token: outcome.deviceToken,
          ...installationKeysBody(outcome.keys),
        }),
      );
    });
  });
}

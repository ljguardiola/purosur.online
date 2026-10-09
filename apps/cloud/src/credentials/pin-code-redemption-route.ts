import {
  cloudError,
  cloudErrorStatus,
  pinCodeRedemptionBodySchema,
  pinCodeRedemptionSchema,
} from "@purosur/contracts";
import { PIN_MIN_DIGITS } from "@purosur/domain";
import { redeemPinCode } from "@purosur/domain/credentials/use-cases";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";
import { readValidatedBody } from "../platform/request-body-schema.js";
import { hashSecretCode } from "../platform/secret-code.js";
import { resolveSourceAddress } from "../platform/source-address.js";
import { answerErrorsWithCloudEnvelope } from "../register/cloud-error-handler.js";
import { authenticateDevice } from "../register/device-authentication.js";
import {
  type DeviceTokensOptions,
  installationTokenPorts,
} from "../register/installation-token-ports.js";
import { PUBLIC_ACCESS } from "../sessions/route-access.js";
import { argon2PinHasher } from "./argon2-pin-hasher.js";
import { DrizzlePinCodeRedemptionStore } from "./drizzle-pin-code-redemption-store.js";

export type PinCodeRedemptionRouteOptions<TQueryResult extends PgQueryResultHKT> =
  DeviceTokensOptions<TQueryResult>;

const DEVICE_TOKEN_REJECTED = cloudError(
  "device_token_rejected",
  "the device token is not recognized",
);
const RESET_CODE_INVALID = cloudError("reset_code_invalid", "the reset code is not recognized");
const RESET_CODE_EXPIRED = cloudError("reset_code_expired", "the reset code has expired");
const RESET_CODE_BURNED = cloudError(
  "reset_code_burned",
  "the reset code was already used or burned by failed attempts",
);

// Public to the backoffice's session guard: the device token is this route's own authentication.
export function registerPinCodeRedemptionRoute<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: PinCodeRedemptionRouteOptions<TQueryResult>,
): void {
  const tokenPorts = installationTokenPorts(options);
  const ports = {
    store: new DrizzlePinCodeRedemptionStore(options.db),
    clock: { now: options.now },
    hasher: argon2PinHasher(),
  };

  app.register(async (scope) => {
    answerErrorsWithCloudEnvelope(scope);

    scope.post(
      "/pin-code-redemptions",
      { config: { access: PUBLIC_ACCESS } },
      async (request, reply) => {
        const authentication = await authenticateDevice(tokenPorts, request.headers.authorization);
        if (authentication.kind !== "installation" || authentication.installation.revoked) {
          await reply
            .code(cloudErrorStatus(DEVICE_TOKEN_REJECTED.code))
            .header("WWW-Authenticate", "Bearer")
            .send(DEVICE_TOKEN_REJECTED);
          return;
        }

        const body = await readValidatedBody(reply, pinCodeRedemptionBodySchema, request.body);
        if (!body) {
          return;
        }

        const outcome = await redeemPinCode(ports, {
          codeHash: hashSecretCode(body.reset_code),
          newPin: body.new_pin,
          registerId: authentication.installation.registerId,
          sourceAddress: resolveSourceAddress(request),
        });

        switch (outcome.kind) {
          case "rate_limited":
            await reply
              .code(cloudErrorStatus("rate_limited"))
              .header("Retry-After", String(outcome.retryAfterSeconds))
              .send(
                cloudError("rate_limited", "too many PIN code redemption attempts", [
                  { retry_after_seconds: outcome.retryAfterSeconds },
                ]),
              );
            return;
          case "unknown_code":
            await reply.code(cloudErrorStatus(RESET_CODE_INVALID.code)).send(RESET_CODE_INVALID);
            return;
          case "expired":
            await reply.code(cloudErrorStatus(RESET_CODE_EXPIRED.code)).send(RESET_CODE_EXPIRED);
            return;
          case "burned":
            await reply.code(cloudErrorStatus(RESET_CODE_BURNED.code)).send(RESET_CODE_BURNED);
            return;
          case "pin_rejected":
            await reply.code(400).send({
              code: "validation_failed",
              message: `new_pin must be at least ${PIN_MIN_DIGITS} digits`,
              details: [{ field: "new_pin" }],
            });
            return;
          case "redeemed":
            await reply.code(200).send(
              pinCodeRedemptionSchema.parse({
                user_id: outcome.userId,
                salt: outcome.salt,
                pin_hash: outcome.pinHash,
              }),
            );
            return;
        }
      },
    );
  });
}

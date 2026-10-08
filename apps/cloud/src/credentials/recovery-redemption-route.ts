import {
  recoveryRedemptionBodySchema,
  recoveryRegistrationOptionsSchema,
  recoveryTokenBodySchema,
} from "@purosur/contracts";
import {
  findRedeemableRecovery,
  type RecoveryTokenRecord,
  recordRegistrationChallenge,
  recordRejectedRedemption,
  redeemRecoveryToken,
} from "@purosur/domain/credentials/use-cases";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requireBackofficeOrigin } from "../access/backoffice-origin.js";
import { resolveSourceAddress } from "../access/recovery-source-address.js";
import { PUBLIC_ACCESS, registerRouteAccess } from "../access/route-access.js";
import { DrizzleRecoveryRedemptionStore } from "./drizzle-recovery-redemption-store.js";
import { reportRecoveryBookkeepingError } from "./recovery-error-reporting.js";
import { recordRedemptionAttempt } from "./recovery-rate-limiter.js";
import {
  type RecoveryRejectedAttemptKind,
  recordRejectedAttempt,
} from "./recovery-rejected-attempt-accumulator.js";
import { recoveryTokenErrorResponse } from "./recovery-token-error-response.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";
import { deriveUserHandle } from "./recovery-user-handle.js";
import { resolveWebAuthnConfig } from "./webauthn-config.js";

export interface RecoveryRedemptionRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  now: () => Date;
  recordRejectedAttempt?: typeof recordRejectedAttempt;
  reportError?: (error: unknown) => void;
}

function sendTokenError(reply: FastifyReply, status: "invalid" | "burned" | "expired"): void {
  const error = recoveryTokenErrorResponse(status);
  void reply.code(error.statusCode).send({ code: error.code, message: error.message });
}

type RedemptionAttempt = Exclude<RecoveryRejectedAttemptKind, "request">;

function readRawToken(body: unknown): string | undefined {
  const result = recoveryTokenBodySchema.safeParse(body);
  return result.success ? result.data.recovery_token : undefined;
}

export function registerRecoveryRedemptionRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RecoveryRedemptionRouteOptions<TQueryResult>,
): void {
  const { now } = options;
  registerRouteAccess(app);
  const webAuthnConfig = resolveWebAuthnConfig(options.backofficeOrigin);
  const doRecordRejectedAttempt = options.recordRejectedAttempt ?? recordRejectedAttempt;
  const reportError = options.reportError ?? reportRecoveryBookkeepingError;
  const ports = { store: new DrizzleRecoveryRedemptionStore(options.db, now) };

  async function checkRedemptionRateLimit(
    request: FastifyRequest,
    reply: FastifyReply,
    attempt: RedemptionAttempt,
  ): Promise<boolean> {
    const sourceAddress = resolveSourceAddress(request);
    const attemptedAt = now();
    const rateLimit = await recordRedemptionAttempt(options.db, {
      sourceAddress,
      now: attemptedAt,
    });
    if (!rateLimit.allowed) {
      // Upserts keyed by the token's own stored hash, never a lookup, so known and unknown
      // tokens do identical work.
      const rawToken = readRawToken(request.body);
      if (rawToken) {
        try {
          await doRecordRejectedAttempt(options.db, {
            kind: attempt,
            keyHash: hashRecoveryToken(rawToken),
            now: attemptedAt,
          });
        } catch (error) {
          reportError(error);
        }
      }
      await reply
        .header("Retry-After", String(rateLimit.retryAfterSeconds))
        .code(429)
        .send({ code: "rate_limited", message: "too many recovery attempts" });
      return false;
    }
    return true;
  }

  async function rejectToken(
    reply: FastifyReply,
    attempt: RedemptionAttempt,
    status: "invalid" | "burned" | "expired",
    token: RecoveryTokenRecord | undefined,
  ): Promise<void> {
    if (token) {
      await recordRejectedRedemption(ports, {
        tokenId: token.id,
        userId: token.userId,
        attempt,
        rejectedWith: status,
      });
    }
    sendTokenError(reply, status);
  }

  async function rejectRedemptionAsInvalid(
    reply: FastifyReply,
    token: RecoveryTokenRecord,
    body: { message: string; details?: { field: string }[] },
  ): Promise<void> {
    await recordRejectedRedemption(ports, {
      tokenId: token.id,
      userId: token.userId,
      attempt: "redeem",
      rejectedWith: "validation_failed",
    });
    await reply.code(400).send({ code: "validation_failed", ...body });
  }

  app.post(
    "/account-recovery-challenges",
    { config: { access: PUBLIC_ACCESS } },
    async (request, reply) => {
      if (!requireBackofficeOrigin(request, reply, options.backofficeOrigin)) {
        return;
      }
      if (!(await checkRedemptionRateLimit(request, reply, "registration_options"))) {
        return;
      }

      const rawToken = readRawToken(request.body);
      if (!rawToken) {
        sendTokenError(reply, "invalid");
        return;
      }

      const found = await findRedeemableRecovery(ports, {
        tokenHash: hashRecoveryToken(rawToken),
        now: now(),
      });
      if (found.kind === "rejected") {
        await rejectToken(reply, "registration_options", found.reason, found.token);
        return;
      }
      const { token, account, credentials } = found;

      const registrationOptions = await generateRegistrationOptions({
        rpName: webAuthnConfig.rpName,
        rpID: webAuthnConfig.rpID,
        userName: account.email,
        userDisplayName: account.firstName,
        userID: deriveUserHandle(account.id),
        attestationType: "none",
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
        excludeCredentials: credentials.map((passkey) => ({
          id: passkey.credentialId,
          ...(passkey.transports ? { transports: passkey.transports } : {}),
        })),
      });

      await recordRegistrationChallenge(ports, {
        tokenId: token.id,
        challenge: registrationOptions.challenge,
      });

      await reply.code(200).send(
        recoveryRegistrationOptionsSchema.parse({
          passkey_registration_options: registrationOptions,
          display_name: account.firstName,
        }),
      );
    },
  );

  app.post(
    "/account-recovery-redemptions",
    { config: { access: PUBLIC_ACCESS } },
    async (request, reply) => {
      if (!requireBackofficeOrigin(request, reply, options.backofficeOrigin)) {
        return;
      }
      if (!(await checkRedemptionRateLimit(request, reply, "redeem"))) {
        return;
      }

      const rawToken = readRawToken(request.body);
      if (!rawToken) {
        sendTokenError(reply, "invalid");
        return;
      }
      const redeemedAt = now();

      const found = await findRedeemableRecovery(ports, {
        tokenHash: hashRecoveryToken(rawToken),
        now: redeemedAt,
      });
      if (found.kind === "rejected") {
        await rejectToken(reply, "redeem", found.reason, found.token);
        return;
      }
      const { token, account } = found;

      if (!token.registrationChallenge) {
        await rejectRedemptionAsInvalid(reply, token, {
          message: "no passkey registration was ever started for this recovery link",
        });
        return;
      }

      const redemption = recoveryRedemptionBodySchema.safeParse(request.body);
      if (!redemption.success) {
        const [firstIssue] = redemption.error.issues;
        await rejectRedemptionAsInvalid(reply, token, {
          message: firstIssue?.message ?? "invalid request body",
          details: [{ field: String(firstIssue?.path[0] ?? "") }],
        });
        return;
      }
      const { passkey_registration: passkeyRegistration, passkey_name: passkeyName } =
        redemption.data;

      const verification = await verifyRegistrationResponse({
        response: passkeyRegistration as RegistrationResponseJSON,
        expectedChallenge: token.registrationChallenge,
        expectedOrigin: webAuthnConfig.expectedOrigin,
        expectedRPID: webAuthnConfig.rpID,
        requireUserVerification: true,
      }).catch(() => ({ verified: false as const }));
      if (!verification.verified) {
        await rejectRedemptionAsInvalid(reply, token, {
          message: "the passkey registration did not verify against the backoffice's origin",
        });
        return;
      }
      const { registrationInfo } = verification;

      const outcome = await redeemRecoveryToken(
        { ...ports, clock: { now } },
        {
          tokenId: token.id,
          userId: account.id,
          passkey: {
            credentialId: registrationInfo.credential.id,
            publicKey: Buffer.from(registrationInfo.credential.publicKey).toString("base64url"),
            counter: registrationInfo.credential.counter,
            transports: registrationInfo.credential.transports ?? null,
            deviceType: registrationInfo.credentialDeviceType,
            backedUp: registrationInfo.credentialBackedUp,
            name: passkeyName,
          },
          redeemedAt,
        },
      );

      if (outcome.kind === "passkey_already_registered") {
        await recordRejectedRedemption(ports, {
          tokenId: token.id,
          userId: token.userId,
          attempt: "redeem",
          rejectedWith: "passkey_already_registered",
        });
        await reply.code(400).send({
          code: "passkey_already_registered",
          message: "this passkey is already registered",
          details: [{ field: "passkey_registration" }],
        });
        return;
      }
      if (outcome.kind === "not_redeemable") {
        await rejectToken(reply, "redeem", outcome.reason, token);
        return;
      }

      await reply.code(200).send({ user_id: outcome.userId });
    },
  );
}

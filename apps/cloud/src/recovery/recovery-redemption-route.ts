import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, passkeys, recoveryTokens, users } from "../db/schema.js";
import { recordRedemptionAttempt } from "./recovery-rate-limiter.js";
import { resolveSourceAddress } from "./recovery-source-address.js";
import { recoveryTokenErrorResponse } from "./recovery-token-error-response.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";
import { classifyRecoveryToken, type RecoveryTokenRow } from "./recovery-token-lookup.js";
import { deriveUserHandle } from "./recovery-user-handle.js";
import { resolveWebAuthnConfig } from "./webauthn-config.js";

export interface RecoveryRedemptionRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so the rate limiter's fixed hourly window is deterministic. */
  now?: () => Date;
}

const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

function sendTokenError(reply: FastifyReply, status: "invalid" | "burned" | "expired"): void {
  const error = recoveryTokenErrorResponse(status);
  void reply.code(error.statusCode).send({ code: error.code, message: error.message });
}

function readRawToken(body: unknown): string | undefined {
  const recoveryToken = (body as { recovery_token?: unknown } | undefined)?.recovery_token;
  return typeof recoveryToken === "string" && recoveryToken !== "" ? recoveryToken : undefined;
}

/**
 * Registers the two WebAuthn-facing endpoints that complete recovery-by-email (§9.7, D44, issue
 * #167): `registration-options` (not in the doc — a T2 technical decision, see the feature
 * document) hands back creation options for a still-live token without touching it, and `redeem`
 * verifies the browser's response and, in one transaction, burns the token and registers the new
 * passkey. Neither ever opens a session.
 */
export function registerRecoveryRedemptionRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RecoveryRedemptionRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  const webAuthnConfig = resolveWebAuthnConfig(options.backofficeOrigin);

  function checkOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
    if (request.headers.origin !== options.backofficeOrigin) {
      void reply.code(403).send({
        code: "origin_rejected",
        message: "the request's Origin does not match the backoffice's own origin",
      });
      return false;
    }
    return true;
  }

  async function checkRedemptionRateLimit(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> {
    const sourceAddress = resolveSourceAddress(request);
    const { allowed } = await recordRedemptionAttempt(options.db, {
      sourceAddress,
      now: now(),
    });
    if (!allowed) {
      await reply
        .header("Retry-After", String(RATE_LIMIT_WINDOW_SECONDS))
        .code(429)
        .send({ code: "rate_limited", message: "too many recovery attempts" });
      return false;
    }
    return true;
  }

  app.post("/users/recovery/registration-options", async (request, reply) => {
    if (!checkOrigin(request, reply)) {
      return;
    }
    if (!(await checkRedemptionRateLimit(request, reply))) {
      return;
    }

    const rawToken = readRawToken(request.body);
    if (!rawToken) {
      sendTokenError(reply, "invalid");
      return;
    }

    const classification = await classifyRecoveryToken(
      options.db,
      hashRecoveryToken(rawToken),
      now(),
    );
    if (classification.status !== "valid") {
      sendTokenError(reply, classification.status);
      return;
    }
    const token = classification.token;

    const [account] = await options.db
      .select({ id: users.id, firstName: users.firstName, email: users.email })
      .from(users)
      .where(eq(users.id, token.userId))
      .limit(1);
    if (!account) {
      // The account backing this token no longer exists; nothing to register against.
      sendTokenError(reply, "invalid");
      return;
    }

    const existingPasskeys = await options.db
      .select({ credentialId: passkeys.credentialId, transports: passkeys.transports })
      .from(passkeys)
      .where(eq(passkeys.userId, account.id));

    const registrationOptions = await generateRegistrationOptions({
      rpName: webAuthnConfig.rpName,
      rpID: webAuthnConfig.rpID,
      userName: account.email,
      userDisplayName: account.firstName,
      userID: deriveUserHandle(account.id),
      attestationType: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      excludeCredentials: existingPasskeys.map((passkey) => ({
        id: passkey.credentialId,
        ...(passkey.transports ? { transports: passkey.transports } : {}),
      })),
    });

    await options.db
      .update(recoveryTokens)
      .set({ registrationChallenge: registrationOptions.challenge })
      .where(eq(recoveryTokens.id, token.id));

    await reply.code(200).send({
      passkey_registration_options: registrationOptions,
      display_name: account.firstName,
    });
  });

  app.post("/users/recovery/redeem", async (request, reply) => {
    if (!checkOrigin(request, reply)) {
      return;
    }
    if (!(await checkRedemptionRateLimit(request, reply))) {
      return;
    }

    const rawToken = readRawToken(request.body);
    if (!rawToken) {
      sendTokenError(reply, "invalid");
      return;
    }
    const tokenHash = hashRecoveryToken(rawToken);
    const redeemedAt = now();

    const classification = await classifyRecoveryToken(options.db, tokenHash, redeemedAt);
    if (classification.status !== "valid") {
      sendTokenError(reply, classification.status);
      return;
    }
    const token: RecoveryTokenRow = classification.token;

    if (!token.registrationChallenge) {
      await reply.code(400).send({
        code: "validation_failed",
        message: "no passkey registration was ever started for this recovery link",
      });
      return;
    }

    const passkeyRegistration = (request.body as { passkey_registration?: unknown } | undefined)
      ?.passkey_registration as RegistrationResponseJSON | undefined;
    if (!passkeyRegistration) {
      await reply.code(400).send({
        code: "validation_failed",
        message: "passkey_registration is required",
        details: [{ field: "passkey_registration" }],
      });
      return;
    }

    const verification = await verifyRegistrationResponse({
      response: passkeyRegistration,
      expectedChallenge: token.registrationChallenge,
      expectedOrigin: webAuthnConfig.expectedOrigin,
      expectedRPID: webAuthnConfig.rpID,
      requireUserVerification: true,
    }).catch(() => ({ verified: false as const }));
    if (!verification.verified) {
      await reply.code(400).send({
        code: "validation_failed",
        message: "the passkey registration did not verify against the backoffice's origin",
      });
      return;
    }
    const { registrationInfo } = verification;

    const [account] = await options.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, token.userId))
      .limit(1);
    if (!account) {
      sendTokenError(reply, "invalid");
      return;
    }

    const outcome = await options.db.transaction(async (tx) => {
      const [burned] = await tx
        .update(recoveryTokens)
        .set({ usedAt: redeemedAt })
        .where(
          and(
            eq(recoveryTokens.id, token.id),
            isNull(recoveryTokens.usedAt),
            isNull(recoveryTokens.voidedAt),
            gt(recoveryTokens.expiresAt, redeemedAt),
          ),
        )
        .returning({ id: recoveryTokens.id });
      if (!burned) {
        return { burned: false } as const;
      }

      const [newPasskey] = await tx
        .insert(passkeys)
        .values({
          userId: account.id,
          credentialId: registrationInfo.credential.id,
          publicKey: Buffer.from(registrationInfo.credential.publicKey).toString("base64url"),
          counter: registrationInfo.credential.counter,
          transports: registrationInfo.credential.transports ?? null,
          deviceType: registrationInfo.credentialDeviceType,
          backedUp: registrationInfo.credentialBackedUp,
        })
        .returning({ id: passkeys.id });
      if (!newPasskey) {
        throw new Error("inserting the recovered passkey returned no row");
      }

      await tx.insert(auditLog).values({
        entity: "recovery_token",
        entityId: token.id,
        actorId: account.id,
        previousValue: null,
        newValue: { usedAt: redeemedAt.toISOString() },
      });
      await tx.insert(auditLog).values({
        entity: "passkey",
        entityId: newPasskey.id,
        actorId: account.id,
        previousValue: null,
        newValue: {
          credentialId: registrationInfo.credential.id,
          deviceType: registrationInfo.credentialDeviceType,
          backedUp: registrationInfo.credentialBackedUp,
        },
      });

      return { burned: true, userId: account.id } as const;
    });

    if (!outcome.burned) {
      // Lost a race with a concurrent redemption of the same token: reclassify it fresh so the
      // response matches what actually happened instead of assuming it was this request's own.
      const raced = await classifyRecoveryToken(options.db, tokenHash, now());
      sendTokenError(reply, raced.status === "valid" ? "burned" : raced.status);
      return;
    }

    await reply.code(200).send({ user_id: outcome.userId });
  });
}

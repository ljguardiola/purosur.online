import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { generateRegistrationOptions, verifyRegistrationResponse } from "@simplewebauthn/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auditLog, passkeys, recoveryTokens, sessions, users } from "../db/schema.js";
import { reportRecoveryBookkeepingError } from "./recovery-error-reporting.js";
import { recordRedemptionAttempt } from "./recovery-rate-limiter.js";
import {
  type RecoveryRejectedAttemptKind,
  recordRejectedAttempt,
} from "./recovery-rejected-attempt-accumulator.js";
import { resolveSourceAddress } from "./recovery-source-address.js";
import { recoveryTokenErrorResponse } from "./recovery-token-error-response.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";
import { classifyRecoveryToken, type RecoveryTokenRow } from "./recovery-token-lookup.js";
import { deriveUserHandle } from "./recovery-user-handle.js";
import { resolveWebAuthnConfig } from "./webauthn-config.js";

export interface RecoveryRedemptionRouteOptions<TQueryResult extends PgQueryResultHKT> {
  db: PgDatabase<TQueryResult>;
  backofficeOrigin: string;
  /** Injected in tests so the rate limiter's rolling one-hour window is deterministic. */
  now?: () => Date;
  /** Injected in tests to prove a bookkeeping failure never turns the 429 into a 500. */
  recordRejectedAttempt?: typeof recordRejectedAttempt;
  /** Injected in tests; defaults to logging and reporting to Sentry. */
  reportError?: (error: unknown) => void;
}

function sendTokenError(reply: FastifyReply, status: "invalid" | "burned" | "expired"): void {
  const error = recoveryTokenErrorResponse(status);
  void reply.code(error.statusCode).send({ code: error.code, message: error.message });
}

type RedemptionAttempt = Exclude<RecoveryRejectedAttemptKind, "request">;

class CredentialAlreadyRegistered extends Error {}

function readRawToken(body: unknown): string | undefined {
  const recoveryToken = (body as { recovery_token?: unknown } | undefined)?.recovery_token;
  return typeof recoveryToken === "string" && recoveryToken !== "" ? recoveryToken : undefined;
}

/**
 * Registers the two WebAuthn-facing endpoints that complete recovery-by-email:
 * `registration-options` hands back creation options for a still-live token without touching it,
 * and `redeem` verifies the browser's response and, in one transaction, burns the token and
 * registers the new passkey. Neither ever opens a session.
 */
export function registerRecoveryRedemptionRoutes<TQueryResult extends PgQueryResultHKT>(
  app: FastifyInstance,
  options: RecoveryRedemptionRouteOptions<TQueryResult>,
): void {
  const now = options.now ?? (() => new Date());
  const webAuthnConfig = resolveWebAuthnConfig(options.backofficeOrigin);
  const doRecordRejectedAttempt = options.recordRejectedAttempt ?? recordRejectedAttempt;
  const reportError = options.reportError ?? reportRecoveryBookkeepingError;

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
    attempt: RedemptionAttempt,
  ): Promise<boolean> {
    const sourceAddress = resolveSourceAddress(request);
    const attemptedAt = now();
    const rateLimit = await recordRedemptionAttempt(options.db, {
      sourceAddress,
      now: attemptedAt,
    });
    if (!rateLimit.allowed) {
      // One synchronous upsert keyed by the token's own stored hash, never a lookup: known and
      // unknown tokens do identical work. A bookkeeping failure here must never turn this 429
      // into a 500.
      // A request that carries no token at all has nothing to key the accumulator by.
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

  // Every rejected attempt on a token that exists is audited against the account it belongs to;
  // an unknown token has no account to attribute the attempt to.
  async function auditRejectedAttempt(
    token: RecoveryTokenRow,
    attempt: RedemptionAttempt,
    rejectedWith: string,
  ): Promise<void> {
    await options.db.insert(auditLog).values({
      entity: "recovery_token",
      entityId: token.id,
      actorId: token.userId,
      previousValue: null,
      newValue: { attempt, rejectedWith },
    });
  }

  async function rejectToken(
    reply: FastifyReply,
    attempt: RedemptionAttempt,
    status: "invalid" | "burned" | "expired",
    token: RecoveryTokenRow | undefined,
  ): Promise<void> {
    if (token) {
      await auditRejectedAttempt(token, attempt, recoveryTokenErrorResponse(status).code);
    }
    sendTokenError(reply, status);
  }

  async function rejectRedemptionAsInvalid(
    reply: FastifyReply,
    token: RecoveryTokenRow,
    body: { message: string; details?: { field: string }[] },
  ): Promise<void> {
    await auditRejectedAttempt(token, "redeem", "validation_failed");
    await reply.code(400).send({ code: "validation_failed", ...body });
  }

  app.post("/users/recovery/registration-options", async (request, reply) => {
    if (!checkOrigin(request, reply)) {
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

    const classification = await classifyRecoveryToken(
      options.db,
      hashRecoveryToken(rawToken),
      now(),
    );
    if (classification.status !== "valid") {
      await rejectToken(reply, "registration_options", classification.status, classification.token);
      return;
    }
    const token = classification.token;

    const [account] = await options.db
      .select({
        id: users.id,
        firstName: users.firstName,
        email: users.email,
        active: users.active,
      })
      .from(users)
      .where(eq(users.id, token.userId))
      .limit(1);
    if (!account) {
      // The account backing this token no longer exists; nothing to register against.
      sendTokenError(reply, "invalid");
      return;
    }
    if (!account.active) {
      // A deactivated account can't recover access, so its link is as unusable as an unknown one.
      await rejectToken(reply, "registration_options", "invalid", token);
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
    if (!(await checkRedemptionRateLimit(request, reply, "redeem"))) {
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
      await rejectToken(reply, "redeem", classification.status, classification.token);
      return;
    }
    const token: RecoveryTokenRow = classification.token;

    const [account] = await options.db
      .select({ id: users.id, active: users.active })
      .from(users)
      .where(eq(users.id, token.userId))
      .limit(1);
    if (!account) {
      sendTokenError(reply, "invalid");
      return;
    }
    if (!account.active) {
      await rejectToken(reply, "redeem", "invalid", token);
      return;
    }

    if (!token.registrationChallenge) {
      await rejectRedemptionAsInvalid(reply, token, {
        message: "no passkey registration was ever started for this recovery link",
      });
      return;
    }

    const passkeyRegistration = (request.body as { passkey_registration?: unknown } | undefined)
      ?.passkey_registration as RegistrationResponseJSON | undefined;
    if (!passkeyRegistration) {
      await rejectRedemptionAsInvalid(reply, token, {
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
      await rejectRedemptionAsInvalid(reply, token, {
        message: "the passkey registration did not verify against the backoffice's origin",
      });
      return;
    }
    const { registrationInfo } = verification;

    const burnAndRegister = options.db.transaction(async (tx) => {
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
        .onConflictDoNothing({ target: passkeys.credentialId })
        .returning({ id: passkeys.id });
      if (!newPasskey) {
        // Throwing rolls the burn back, so the link stays usable with a different authenticator.
        throw new CredentialAlreadyRegistered();
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

      // Redeeming a recovery link ends every session already open on the account (drafts/docs
      // §12.3 ~3878, §9.7 ~3204); it never opens a new one itself.
      await tx
        .update(sessions)
        .set({ revokedAt: redeemedAt })
        .where(and(eq(sessions.userId, account.id), isNull(sessions.revokedAt)));

      return { burned: true, userId: account.id } as const;
    });
    const outcome = await burnAndRegister.catch((error: unknown) => {
      if (error instanceof CredentialAlreadyRegistered) {
        return { burned: false, credentialAlreadyRegistered: true } as const;
      }
      throw error;
    });

    if ("credentialAlreadyRegistered" in outcome) {
      await rejectRedemptionAsInvalid(reply, token, {
        message: "this passkey is already registered",
        details: [{ field: "passkey_registration" }],
      });
      return;
    }
    if (!outcome.burned) {
      // Lost a race with a concurrent redemption of the same token: reclassify it fresh so the
      // response matches what actually happened instead of assuming it was this request's own.
      const raced = await classifyRecoveryToken(options.db, tokenHash, now());
      await rejectToken(reply, "redeem", raced.status === "valid" ? "burned" : raced.status, token);
      return;
    }

    await reply.code(200).send({ user_id: outcome.userId });
  });
}

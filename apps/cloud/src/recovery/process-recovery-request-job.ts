import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, recoveryTokens, users } from "../db/schema.js";
import type { RecoveryEmailSender } from "./recovery-email-sender.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";

export interface RecoveryRequestJobPayload {
  email: string;
  /** ISO 8601: graphile-worker stores the payload as JSON. */
  requestedAt: string;
  admitted: boolean;
}

export interface ProcessRecoveryRequestJobDeps {
  now: () => Date;
  backofficeOrigin: string;
  emailSender: RecoveryEmailSender;
}

const TOKEN_BYTES = 20; // 160 bits, well over the ≥80-bit floor (§11, D44).
const TOKEN_LIFETIME_MS = 15 * 60 * 1000;

function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

function recoveryLink(backofficeOrigin: string, rawToken: string): string {
  // The token lives in the URL fragment, never sent to the server, so it never reaches access
  // logs or a Referer header (§9.7).
  return `${backofficeOrigin}/recuperar/enlace#${rawToken}`;
}

/**
 * The graphile-worker task body for every well-formed `POST /users/recovery/request`: resolves
 * the account and, for a request the rate limiter rejected or an account that is deactivated,
 * only audits it against that account. Otherwise it issues a fresh token in the same transaction
 * that voids any live one for that account, audits the issuance, and emails the link. An email
 * that fails to send throws, so graphile-worker's own retry applies; that retry replaces the link
 * its own request already issued, but never one issued for a newer request.
 */
export async function processRecoveryRequestJob<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  payload: RecoveryRequestJobPayload,
  deps: ProcessRecoveryRequestJobDeps,
): Promise<void> {
  const [account] = await db
    .select({ id: users.id, active: users.active })
    .from(users)
    .where(eq(users.email, payload.email))
    .limit(1);
  if (!account) {
    return;
  }

  const rejectedWith = !payload.admitted
    ? "rate_limited"
    : !account.active
      ? "account_inactive"
      : undefined;
  if (rejectedWith) {
    await db.insert(auditLog).values({
      entity: "user",
      entityId: account.id,
      actorId: account.id,
      previousValue: null,
      newValue: { attempt: "request", rejectedWith },
    });
    return;
  }

  const now = deps.now();
  const requestedAt = new Date(payload.requestedAt);
  const rawToken = generateRawToken();

  const issued = await db.transaction(async (tx) => {
    const [newerRequestToken] = await tx
      .select({ id: recoveryTokens.id })
      .from(recoveryTokens)
      .where(
        and(eq(recoveryTokens.userId, account.id), gt(recoveryTokens.requestedAt, requestedAt)),
      )
      .limit(1);
    if (newerRequestToken) {
      return false;
    }

    await tx
      .update(recoveryTokens)
      .set({ voidedAt: now })
      .where(
        and(
          eq(recoveryTokens.userId, account.id),
          isNull(recoveryTokens.usedAt),
          isNull(recoveryTokens.voidedAt),
        ),
      );

    const [token] = await tx
      .insert(recoveryTokens)
      .values({
        userId: account.id,
        tokenHash: hashRecoveryToken(rawToken),
        requestedAt,
        issuedAt: now,
        expiresAt: new Date(now.getTime() + TOKEN_LIFETIME_MS),
      })
      .returning({
        id: recoveryTokens.id,
        issuedAt: recoveryTokens.issuedAt,
        expiresAt: recoveryTokens.expiresAt,
      });
    if (!token) {
      throw new Error("inserting the recovery token returned no row");
    }

    await tx.insert(auditLog).values({
      entity: "recovery_token",
      entityId: token.id,
      actorId: account.id,
      previousValue: null,
      newValue: {
        issuedAt: token.issuedAt.toISOString(),
        expiresAt: token.expiresAt.toISOString(),
      },
    });

    return true;
  });
  if (!issued) {
    return;
  }

  await deps.emailSender.sendRecoveryLink({
    to: payload.email,
    link: recoveryLink(deps.backofficeOrigin, rawToken),
  });
}

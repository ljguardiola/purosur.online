import { randomBytes } from "node:crypto";
import { and, eq, gte, isNull, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { openAlert } from "../alerts/open-alert.js";
import { auditLog, recoveryTokens, users } from "../platform/db/schema.js";
import type { SendRecoveryLinkInput } from "./recovery-email-sender.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";

export interface RecoveryRequestJobPayload {
  email: string;
  /** graphile-worker stores the payload as JSON, hence the ISO 8601 string. */
  requestedAt: string;
  requestId: string;
}

export interface ProcessRecoveryRequestJobDeps {
  now: () => Date;
  backofficeOrigin: string;
}

export interface ProcessRecoveryRequestJobResult {
  /** Sent only after the caller releases the pool client this job borrowed, so a slow send never
   * holds a connection checked out. */
  send?: SendRecoveryLinkInput;
}

const TOKEN_ENTROPY_BITS = 160;
const TOKEN_BYTES = TOKEN_ENTROPY_BITS / 8;
const TOKEN_LIFETIME_MS = 15 * 60 * 1000;

function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

function recoveryLink(backofficeOrigin: string, rawToken: string): string {
  // The token lives in the URL fragment: fragments never reach the server, access logs, or a
  // Referer header.
  return `${backofficeOrigin}/account-recovery/passkey#${rawToken}`;
}

export async function processRecoveryRequestJob<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  payload: RecoveryRequestJobPayload,
  deps: ProcessRecoveryRequestJobDeps,
): Promise<ProcessRecoveryRequestJobResult> {
  const requestedAt = new Date(payload.requestedAt);

  const [account] = await db
    .select({ id: users.id, active: users.active })
    .from(users)
    .where(eq(users.email, payload.email))
    .limit(1);
  if (!account) {
    return {};
  }

  if (!account.active) {
    await db.insert(auditLog).values({
      entity: "user",
      entityId: account.id,
      actorId: account.id,
      previousValue: null,
      newValue: { attempt: "request", rejectedWith: "account_inactive" },
      at: requestedAt,
    });
    return {};
  }

  const now = deps.now();
  const rawToken = generateRawToken();

  const issued = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`recovery_token:${account.id}`}, 0))`,
    );
    const [supersedingToken] = await tx
      .select({ id: recoveryTokens.id })
      .from(recoveryTokens)
      .where(
        and(
          eq(recoveryTokens.userId, account.id),
          gte(recoveryTokens.requestedAt, requestedAt),
          ne(recoveryTokens.requestId, payload.requestId),
        ),
      )
      .limit(1);
    if (supersedingToken) {
      await tx.insert(auditLog).values({
        entity: "user",
        entityId: account.id,
        actorId: account.id,
        previousValue: null,
        newValue: { attempt: "request", rejectedWith: "superseded" },
        at: requestedAt,
      });
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
        requestId: payload.requestId,
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
      at: requestedAt,
    });

    // Only an issued link opens this alert: a rejected/superseded request must stay
    // indistinguishable from an unknown email to whoever triggered it.
    await openAlert(
      tx,
      {
        kind: "backoffice_recovery_requested",
        scope: account.id,
        detail: {
          requestedAt: requestedAt.toISOString(),
          issuedAt: token.issuedAt.toISOString(),
          expiresAt: token.expiresAt.toISOString(),
        },
      },
      { now: () => now },
    );

    return true;
  });
  if (!issued) {
    return {};
  }

  return { send: { to: payload.email, link: recoveryLink(deps.backofficeOrigin, rawToken) } };
}

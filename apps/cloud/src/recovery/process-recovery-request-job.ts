import { randomBytes } from "node:crypto";
import { and, eq, gte, isNull, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, recoveryTokens, users } from "../db/schema.js";
import type { SendRecoveryLinkInput } from "./recovery-email-sender.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";

export interface RecoveryRequestJobPayload {
  email: string;
  /** ISO 8601: graphile-worker stores the payload as JSON. */
  requestedAt: string;
  /** Fixed when the request is enqueued, so every retry of its job carries the same one. Only an
   * admitted request is ever enqueued (see `recovery-rejected-attempt-accumulator.ts` for a
   * rejected one), so this job never carries a rate-limit rejection of its own. */
  requestId: string;
}

export interface ProcessRecoveryRequestJobDeps {
  now: () => Date;
  backofficeOrigin: string;
}

export interface ProcessRecoveryRequestJobResult {
  /** Set only when a link was actually issued; the caller sends it after releasing the pool
   * client this job borrowed, so a slow Resend call never holds it checked out (H3). */
  send?: SendRecoveryLinkInput;
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
 * The graphile-worker task body for every admitted `POST /users/recovery/request` (a rejected one
 * is never enqueued: see `recovery-rejected-attempt-accumulator.ts`). Resolves the account and,
 * for a deactivated one, only audits it against that account. Otherwise it issues a fresh token in
 * the same transaction that voids any live one for that account and audits the issuance, then
 * returns the link for the caller to send once it has released the pool client this job borrowed
 * (H3): the caller must propagate a send failure so graphile-worker's own retry applies, and that
 * retry replaces the link its own request already issued, but never one issued for a different
 * request made at the same time or later, which instead leaves the request audited as superseded.
 * Every audit row this job writes is stamped `at` the request's own time (H4), not whenever this
 * job happens to run. Jobs for the same account are serialized, so concurrent ones can never both
 * leave a live link.
 */
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

    return true;
  });
  if (!issued) {
    return {};
  }

  return { send: { to: payload.email, link: recoveryLink(deps.backofficeOrigin, rawToken) } };
}

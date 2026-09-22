import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, recoveryTokens, users } from "../db/schema.js";
import type { RecoveryEmailSender } from "./recovery-email-sender.js";

export interface RecoveryRequestJobPayload {
  email: string;
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

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("base64url");
}

function recoveryLink(backofficeOrigin: string, rawToken: string): string {
  // The token lives in the URL fragment, never sent to the server, so it never reaches access
  // logs or a Referer header (§9.7).
  return `${backofficeOrigin}/recuperar/enlace#${rawToken}`;
}

/**
 * The graphile-worker task body for an admitted `POST /users/recovery/request`: resolves the
 * account, issues a fresh token in the same transaction that voids any live one for that
 * account, audits the issuance, and emails the link. An email that fails to send throws, so
 * graphile-worker's own retry applies; a retry that follows issues (and mails) a new token, which
 * is the same outcome as an ordinary second request.
 */
export async function processRecoveryRequestJob<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  payload: RecoveryRequestJobPayload,
  deps: ProcessRecoveryRequestJobDeps,
): Promise<void> {
  const [account] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, payload.email), eq(users.active, true)))
    .limit(1);
  if (!account) {
    return;
  }

  const now = deps.now();
  const rawToken = generateRawToken();

  await db.transaction(async (tx) => {
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
        tokenHash: hashToken(rawToken),
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

    return token;
  });

  await deps.emailSender.sendRecoveryLink({
    to: payload.email,
    link: recoveryLink(deps.backofficeOrigin, rawToken),
  });
}

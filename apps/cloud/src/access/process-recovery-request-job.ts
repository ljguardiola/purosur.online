import { randomBytes } from "node:crypto";
import { issueRecoveryToken } from "@purosur/domain/access/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { DrizzleRecoveryTokenStore } from "./drizzle-recovery-token-store.js";
import type { SendRecoveryLinkInput } from "./recovery-email-sender.js";
import type { RecoveryRequestJobPayload } from "./recovery-request-job-payload.js";
import { hashRecoveryToken } from "./recovery-token-hash.js";

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
  const rawToken = generateRawToken();

  const outcome = await issueRecoveryToken(
    { store: new DrizzleRecoveryTokenStore(db) },
    {
      email: payload.email,
      requestId: payload.requestId,
      requestedAt: new Date(payload.requestedAt),
      now: deps.now(),
      tokenHash: hashRecoveryToken(rawToken),
    },
  );
  if (outcome.kind !== "issued") {
    return {};
  }

  return { send: { to: payload.email, link: recoveryLink(deps.backofficeOrigin, rawToken) } };
}

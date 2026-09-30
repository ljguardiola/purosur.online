import { isPinCodeBurned, isPinCodeExpired, type PinCodeState } from "@purosur/domain";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { userPinCodes } from "../platform/db/schema.js";
import { hashSecretCode } from "../platform/secret-code.js";
import type { FirstPinCodeEmailSender } from "./recovery-email-sender.js";
import { type ReportRecoveryErrorDeps, reportRecoveryError } from "./recovery-error-reporting.js";

export interface FirstPinCodeEmailJobPayload {
  email: string;
  code: string;
  expiresAt: string;
}

export interface EmailedPinCode extends PinCodeState {
  expiresAt: Date;
}

export interface SendFirstPinCodeEmailJobDeps extends ReportRecoveryErrorDeps {
  emailSender: FirstPinCodeEmailSender;
  now: () => Date;
  findPinCode: (code: string) => Promise<EmailedPinCode | undefined>;
}

export async function findPinCodeByCode<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  code: string,
): Promise<EmailedPinCode | undefined> {
  const [row] = await db
    .select({
      expiresAt: userPinCodes.expiresAt,
      redeemedAt: userPinCodes.redeemedAt,
      supersededAt: userPinCodes.supersededAt,
      failedAttempts: userPinCodes.failedAttempts,
    })
    .from(userPinCodes)
    .where(eq(userPinCodes.codeHash, hashSecretCode(code)));
  return row;
}

function isLive(code: EmailedPinCode | undefined, now: Date): boolean {
  return code !== undefined && !isPinCodeBurned(code) && !isPinCodeExpired(code.expiresAt, now);
}

function isFirstPinCodeEmailJobPayload(payload: unknown): payload is FirstPinCodeEmailJobPayload {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  const candidate = payload as Partial<Record<keyof FirstPinCodeEmailJobPayload, unknown>>;
  return (
    typeof candidate.email === "string" &&
    typeof candidate.code === "string" &&
    typeof candidate.expiresAt === "string" &&
    !Number.isNaN(Date.parse(candidate.expiresAt))
  );
}

export async function sendFirstPinCodeEmailJob(
  payload: unknown,
  { emailSender, now, findPinCode, captureException }: SendFirstPinCodeEmailJobDeps,
): Promise<void> {
  if (!isFirstPinCodeEmailJobPayload(payload)) {
    throw new Error("first PIN code email: malformed job payload");
  }
  if (!isLive(await findPinCode(payload.code), now())) {
    return;
  }
  try {
    await emailSender.sendFirstPinCode({ to: payload.email, code: payload.code });
  } catch (error) {
    reportRecoveryError(
      "first PIN code: sending the email failed",
      error,
      captureException ? { captureException } : {},
    );
    throw error;
  }
}

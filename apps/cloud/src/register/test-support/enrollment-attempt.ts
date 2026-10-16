import { enrollInstallation } from "@purosur/domain/register/use-cases";
import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerEnrollmentCodes, registerInstallations } from "../../platform/db/schema.js";
import { hashSecretCode } from "../../platform/secret-code.js";
import { issueDeviceToken } from "../device-token.js";
import { generateInstallationKey } from "../installation-key.js";
import { registerEnrollmentCodeMatches } from "../register-enrollment-code.js";
import { keyStore } from "./key-store.js";

export interface EnrollmentAttempt {
  code: string;
  sourceAddress: string;
}

export async function issueEnrollmentCode<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  registerId: string,
  { code }: EnrollmentAttempt,
  issuedAt: Date,
): Promise<void> {
  await db.insert(registerEnrollmentCodes).values({
    registerId,
    codeLookup: code.slice(0, 4),
    codeHash: hashSecretCode(code),
    issuedAt,
    expiresAt: new Date(issuedAt.getTime() + 15 * 60 * 1000),
  });
}

export function enrollNewInstallation<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  { code, sourceAddress }: EnrollmentAttempt,
  now: Date,
) {
  return enrollInstallation(
    {
      store: keyStore(db),
      clock: { now: () => now },
      tokens: { issue: issueDeviceToken },
      codes: { matches: registerEnrollmentCodeMatches },
      keys: { generate: generateInstallationKey },
    },
    {
      code,
      sourceAddress,
      hostname: "CAJA-NUEVA",
      windowsVersion: "Windows 11 Pro 10.0.26100",
    },
  );
}

export function installationsOf<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  registerId: string,
) {
  return db
    .select({
      hostname: registerInstallations.hostname,
      revokedAt: registerInstallations.revokedAt,
      revocationReason: registerInstallations.revocationReason,
    })
    .from(registerInstallations)
    .where(eq(registerInstallations.registerId, registerId))
    .orderBy(asc(registerInstallations.enrolledAt));
}

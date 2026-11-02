import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { revokedInstallationConfirmations, users } from "../../platform/db/schema.js";

export async function confirmRevokedInstallation<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  {
    pointOfSaleNumber,
    fortnight,
    installationId,
    confirmedAt = new Date("2026-10-16T12:00:00.000Z"),
  }: {
    pointOfSaleNumber: number;
    fortnight: Fortnight;
    installationId: string;
    confirmedAt?: Date;
  },
): Promise<void> {
  const [confirmer] = await db.select({ id: users.id }).from(users).limit(1);
  if (!confirmer) {
    throw new Error("test setup: confirming an installation needs a user");
  }
  await db.insert(revokedInstallationConfirmations).values({
    pointOfSaleNumber,
    fortnightStart: fortnight.start,
    installationId,
    confirmedBy: confirmer.id,
    confirmedAt,
  });
}

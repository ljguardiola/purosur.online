import type {
  ConfirmRevokedInstallationStore,
  ConfirmRevokedInstallationStoreTransaction,
  FortnightReportKey,
  InstallationOfFortnightReport,
  RecordedFortnightReport,
  RegisterEventStreams,
  RevokedInstallationConfirmationAudit,
  RevokedInstallationConfirmationRecord,
} from "@purosur/domain/fiscal/use-cases";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  caeaCodes,
  fortnightReports,
  pointOfSaleClaims,
  registerInstallations,
  registers,
  revokedInstallationConfirmations,
} from "../platform/db/schema.js";
import { DrizzleRevokedInstallationConfirmations } from "./drizzle-revoked-installation-confirmations.js";
import { fortnightReportLock } from "./fortnight-report-lock.js";

type RegisterEventStreamsIn<TQueryResult extends PgQueryResultHKT> = (
  tx: PgDatabase<TQueryResult>,
) => RegisterEventStreams;

class DrizzleConfirmRevokedInstallationTransaction<TQueryResult extends PgQueryResultHKT>
  implements ConfirmRevokedInstallationStoreTransaction
{
  private readonly tx: PgDatabase<TQueryResult>;
  private readonly streams: RegisterEventStreams;

  constructor(tx: PgDatabase<TQueryResult>, streamsIn: RegisterEventStreamsIn<TQueryResult>) {
    this.tx = tx;
    this.streams = streamsIn(tx);
  }

  async holdFortnightPresentation(key: FortnightReportKey): Promise<void> {
    await this.tx.execute(sql`select pg_advisory_xact_lock(${fortnightReportLock(key)})`);
  }

  async installationOfReport(
    { pointOfSaleNumber, fortnight }: FortnightReportKey,
    installationId: string,
    locationId: string,
  ): Promise<InstallationOfFortnightReport | null> {
    const [owner] = await this.tx
      .select({ registerId: registerInstallations.registerId })
      .from(registerInstallations)
      .innerJoin(registers, eq(registers.id, registerInstallations.registerId))
      .innerJoin(
        pointOfSaleClaims,
        and(
          eq(pointOfSaleClaims.registerId, registerInstallations.registerId),
          eq(pointOfSaleClaims.pointOfSaleNumber, pointOfSaleNumber),
          eq(pointOfSaleClaims.mechanism, "offline"),
        ),
      )
      .innerJoin(caeaCodes, eq(caeaCodes.fortnightStart, fortnight.start))
      .where(
        and(eq(registerInstallations.id, installationId), eq(registers.locationId, locationId)),
      );
    const installation = owner
      ? (await this.streams.installationsOf(owner.registerId)).find(
          (reach) => reach.installationId === installationId,
        )
      : undefined;
    return owner && installation ? { registerId: owner.registerId, installation } : null;
  }

  async recordedReportState({
    pointOfSaleNumber,
    fortnight,
  }: FortnightReportKey): Promise<RecordedFortnightReport["state"] | null> {
    const [report] = await this.tx
      .select({ state: fortnightReports.state })
      .from(fortnightReports)
      .where(
        and(
          eq(fortnightReports.pointOfSaleNumber, pointOfSaleNumber),
          eq(fortnightReports.fortnightStart, fortnight.start),
        ),
      );
    return report?.state ?? null;
  }

  confirmedInstallations(key: FortnightReportKey): Promise<string[]> {
    return new DrizzleRevokedInstallationConfirmations(this.tx).confirmedInstallations(key);
  }

  async recordConfirmation({
    pointOfSaleNumber,
    fortnight,
    installationId,
    confirmedBy,
    confirmedAt,
  }: RevokedInstallationConfirmationRecord): Promise<void> {
    await this.tx.insert(revokedInstallationConfirmations).values({
      pointOfSaleNumber,
      fortnightStart: fortnight.start,
      installationId,
      confirmedBy,
      confirmedAt,
    });
  }

  async recordConfirmationAudit({
    pointOfSaleNumber,
    fortnight,
    installationId,
    registerId,
    revokedAt,
    actorId,
    at,
  }: RevokedInstallationConfirmationAudit): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "register_installation",
      entityId: installationId,
      actorId,
      newValue: {
        point_of_sale_number: pointOfSaleNumber,
        fortnight_start: fortnight.start,
        fortnight_end: fortnight.end,
        register_id: registerId,
        revoked_at: revokedAt.toISOString(),
      },
      at,
    });
  }
}

export class DrizzleConfirmRevokedInstallationStore<TQueryResult extends PgQueryResultHKT>
  implements ConfirmRevokedInstallationStore
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly streamsIn: RegisterEventStreamsIn<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>, streamsIn: RegisterEventStreamsIn<TQueryResult>) {
    this.db = db;
    this.streamsIn = streamsIn;
  }

  transaction<TOutcome>(
    work: (tx: ConfirmRevokedInstallationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleConfirmRevokedInstallationTransaction(tx, this.streamsIn)),
    );
  }
}

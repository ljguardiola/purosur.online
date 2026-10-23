import type {
  EventPosition,
  InstallationReceivedSeqs,
  ReplenishedEvent,
  ReplenishmentPosition,
  RestoredRegisterReplenishment,
} from "@purosur/domain/sync/use-cases";
import { and, asc, eq, exists, gt, notExists, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { inbox, refusedEvents, registerInstallations } from "../platform/db/schema.js";

export class DrizzleRegisterReplenishment<TQueryResult extends PgQueryResultHKT>
  implements RestoredRegisterReplenishment
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async receivedSeqsOfRefusedInstallations(
    registerId: string,
  ): Promise<InstallationReceivedSeqs[]> {
    const rows = await this.db
      .select({ deviceId: inbox.deviceId, deviceSeq: inbox.deviceSeq })
      .from(inbox)
      .innerJoin(registerInstallations, eq(registerInstallations.id, inbox.deviceId))
      .where(
        and(
          eq(registerInstallations.registerId, registerId),
          exists(
            this.db
              .select({ deviceId: refusedEvents.deviceId })
              .from(refusedEvents)
              .where(eq(refusedEvents.deviceId, inbox.deviceId)),
          ),
        ),
      )
      .orderBy(asc(inbox.deviceId), asc(inbox.deviceSeq));
    const seqsByInstallation = new Map<string, number[]>();
    for (const { deviceId, deviceSeq } of rows) {
      seqsByInstallation.set(deviceId, [...(seqsByInstallation.get(deviceId) ?? []), deviceSeq]);
    }
    return [...seqsByInstallation].map(([deviceId, seqs]) => ({ deviceId, seqs }));
  }

  async ownEventsAbove(
    registerId: string,
    { predecessorDeviceId, lastAcknowledgedSeq }: ReplenishmentPosition,
    after: EventPosition | undefined,
    limit: number,
    setAsideAbove: ReadonlyMap<string, number>,
  ): Promise<ReplenishedEvent[]> {
    const predecessorEnrolledAt = await this.enrolledAtOf(registerId, predecessorDeviceId);
    const afterEnrolledAt = after && (await this.enrolledAtOf(registerId, after.deviceId));
    const rows = await this.db
      .select({
        deviceId: inbox.deviceId,
        eventId: inbox.eventId,
        deviceSeq: inbox.deviceSeq,
        aggregateType: inbox.aggregateType,
        aggregateId: inbox.aggregateId,
        eventType: inbox.eventType,
        schemaVersion: inbox.schemaVersion,
        payload: inbox.payload,
        occurredAt: inbox.occurredAt,
        actorId: inbox.actorId,
        chainHmac: inbox.chainHmac,
      })
      .from(inbox)
      .innerJoin(registerInstallations, eq(registerInstallations.id, inbox.deviceId))
      .where(
        and(
          eq(registerInstallations.registerId, registerId),
          or(
            and(eq(inbox.deviceId, predecessorDeviceId), gt(inbox.deviceSeq, lastAcknowledgedSeq)),
            gt(registerInstallations.enrolledAt, predecessorEnrolledAt),
          ),
          after && afterEnrolledAt
            ? or(
                gt(registerInstallations.enrolledAt, afterEnrolledAt),
                and(
                  eq(registerInstallations.enrolledAt, afterEnrolledAt),
                  gt(registerInstallations.id, after.deviceId),
                ),
                and(
                  eq(registerInstallations.id, after.deviceId),
                  gt(inbox.deviceSeq, after.deviceSeq),
                ),
              )
            : undefined,
          this.notSetAside(setAsideAbove),
        ),
      )
      .orderBy(
        asc(registerInstallations.enrolledAt),
        asc(registerInstallations.id),
        asc(inbox.deviceSeq),
      )
      .limit(limit);
    return rows.map((row) => ({
      deviceId: row.deviceId,
      event: {
        event_id: row.eventId,
        device_seq: row.deviceSeq,
        aggregate_type: row.aggregateType,
        aggregate_id: row.aggregateId,
        event_type: row.eventType,
        schema_version: row.schemaVersion,
        payload: row.payload,
        occurred_at: row.occurredAt.toISOString(),
        actor_id: row.actorId,
        chain_hmac: row.chainHmac,
      },
    }));
  }

  private notSetAside(setAsideAbove: ReadonlyMap<string, number>) {
    if (setAsideAbove.size === 0) {
      return undefined;
    }
    return notExists(
      this.db
        .select({ eventId: refusedEvents.eventId })
        .from(refusedEvents)
        .where(
          and(
            eq(refusedEvents.deviceId, inbox.deviceId),
            eq(refusedEvents.eventId, inbox.eventId),
            eq(refusedEvents.deviceSeq, inbox.deviceSeq),
            or(
              ...[...setAsideAbove].map(([deviceId, aboveSeq]) =>
                and(eq(refusedEvents.deviceId, deviceId), gt(refusedEvents.deviceSeq, aboveSeq)),
              ),
            ),
          ),
        ),
    );
  }

  private async enrolledAtOf(registerId: string, deviceId: string): Promise<Date> {
    const [installation] = await this.db
      .select({ enrolledAt: registerInstallations.enrolledAt })
      .from(registerInstallations)
      .where(
        and(
          eq(registerInstallations.id, deviceId),
          eq(registerInstallations.registerId, registerId),
        ),
      );
    if (!installation) {
      throw new Error("a replenishment position names an installation that is not of the register");
    }
    return installation.enrolledAt;
  }
}

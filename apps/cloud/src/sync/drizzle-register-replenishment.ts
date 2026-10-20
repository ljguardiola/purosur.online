import type {
  EventPosition,
  PredecessorStanding,
  ReplenishedEvent,
  ReplenishedUser,
  ReplenishmentPosition,
  RestoredRegisterReplenishment,
} from "@purosur/domain/sync/use-cases";
import { and, asc, eq, gt, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { inbox, registerInstallations, registers, users } from "../platform/db/schema.js";
import { readUsers } from "./read-pulled-rows.js";

export class DrizzleRegisterReplenishment<TQueryResult extends PgQueryResultHKT>
  implements RestoredRegisterReplenishment
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  async predecessorStanding(
    registerId: string,
    predecessorDeviceId: string,
  ): Promise<PredecessorStanding> {
    const [installation] = await this.db
      .select({ revokedAt: registerInstallations.revokedAt })
      .from(registerInstallations)
      .where(
        and(
          eq(registerInstallations.id, predecessorDeviceId),
          eq(registerInstallations.registerId, registerId),
        ),
      );
    if (!installation) {
      return "not_of_register";
    }
    return installation.revokedAt === null ? "not_revoked" : "revoked";
  }

  async isReplenishmentCursor(
    registerId: string,
    predecessorDeviceId: string,
    cursor: EventPosition,
  ): Promise<boolean> {
    if (cursor.deviceId === predecessorDeviceId) {
      return true;
    }
    const predecessorEnrolledAt = await this.enrolledAtOf(registerId, predecessorDeviceId);
    const [installation] = await this.db
      .select({ id: registerInstallations.id })
      .from(registerInstallations)
      .where(
        and(
          eq(registerInstallations.id, cursor.deviceId),
          eq(registerInstallations.registerId, registerId),
          gt(registerInstallations.enrolledAt, predecessorEnrolledAt),
        ),
      );
    return installation !== undefined;
  }

  async ownEventsAbove(
    registerId: string,
    { predecessorDeviceId, lastAcknowledgedSeq }: ReplenishmentPosition,
    after: EventPosition | undefined,
    limit: number,
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

  async branchUsers(registerId: string): Promise<ReplenishedUser[]> {
    const branchUsers = await this.db
      .select({ id: users.id })
      .from(registers)
      .innerJoin(users, eq(users.locationId, registers.locationId))
      .where(eq(registers.id, registerId));
    const rows = await readUsers(
      this.db,
      branchUsers.map(({ id }) => id),
    );
    return [...rows].map(([userId, row]) => ({ userId, ...row }));
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

import type {
  PredecessorStanding,
  RestoredRegisterPredecessors,
} from "@purosur/domain/register/use-cases";
import { and, eq, gt } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { registerInstallations } from "../platform/db/schema.js";

export class DrizzleRestoredRegisterPredecessors<TQueryResult extends PgQueryResultHKT>
  implements RestoredRegisterPredecessors
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
    cursorDeviceId: string,
  ): Promise<boolean> {
    if (cursorDeviceId === predecessorDeviceId) {
      return true;
    }
    const [predecessor] = await this.db
      .select({ enrolledAt: registerInstallations.enrolledAt })
      .from(registerInstallations)
      .where(
        and(
          eq(registerInstallations.id, predecessorDeviceId),
          eq(registerInstallations.registerId, registerId),
        ),
      );
    if (!predecessor) {
      throw new Error("a replenishment position names an installation that is not of the register");
    }
    const [installation] = await this.db
      .select({ id: registerInstallations.id })
      .from(registerInstallations)
      .where(
        and(
          eq(registerInstallations.id, cursorDeviceId),
          eq(registerInstallations.registerId, registerId),
          gt(registerInstallations.enrolledAt, predecessor.enrolledAt),
        ),
      );
    return installation !== undefined;
  }
}

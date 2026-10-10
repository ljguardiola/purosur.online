import type { Fortnight } from "@purosur/domain/fiscal/use-cases";
import type { OfflineAuthorizationCodeRequests } from "@purosur/domain/sync/use-cases";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  caeaCodes,
  registerInstallations,
  registerOfflinePointsOfSale,
} from "../platform/db/schema.js";
import { reportError } from "../platform/error-reporting.js";
import type { EnqueueOfflineAuthorizationCodeRequest } from "./graphile-offline-authorization-code-queue.js";

function reportRequestFailure(error: unknown): void {
  reportError("pull: requesting the offline authorization code failed", error);
}

export class DrizzleOfflineAuthorizationCodeRequests<TQueryResult extends PgQueryResultHKT>
  implements OfflineAuthorizationCodeRequests
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly enqueue: EnqueueOfflineAuthorizationCodeRequest | undefined;
  private readonly reportFailure: (error: unknown) => void;

  constructor(
    db: PgDatabase<TQueryResult>,
    enqueue?: EnqueueOfflineAuthorizationCodeRequest,
    reportFailure: (error: unknown) => void = reportRequestFailure,
  ) {
    this.db = db;
    this.enqueue = enqueue;
    this.reportFailure = reportFailure;
  }

  async installedRegisterHasOfflinePointOfSale(deviceId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ registerId: registerOfflinePointsOfSale.registerId })
      .from(registerInstallations)
      .innerJoin(
        registerOfflinePointsOfSale,
        eq(registerOfflinePointsOfSale.registerId, registerInstallations.registerId),
      )
      .where(eq(registerInstallations.id, deviceId));
    return row !== undefined;
  }

  async holdsOfflineAuthorizationCodeFor(fortnight: Fortnight): Promise<boolean> {
    const [held] = await this.db
      .select({ id: caeaCodes.id })
      .from(caeaCodes)
      .where(eq(caeaCodes.fortnightStart, fortnight.start));
    return held !== undefined;
  }

  async requestOfflineAuthorizationCode(): Promise<void> {
    const enqueue = this.enqueue;
    if (enqueue === undefined) {
      return;
    }
    try {
      await this.db.transaction((transaction) => enqueue(transaction));
    } catch (error) {
      this.reportFailure(error);
    }
  }
}

import type {
  AuthorizationNumber,
  LocalStanding,
  OrphanRegularization,
  OrphanRegularizationLane,
  OrphanRegularizationLanes,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { DedicatedConnections } from "../platform/dedicated-connections.js";
import type { EnqueueOrphanCreditNote } from "./enqueue-orphan-credit-note.js";
import { localStandingOfAuthorization } from "./orphan-local-standing.js";
import { withPointOfSaleLaneLock } from "./point-of-sale-lane-lock.js";
import { recordOrphanRegularization } from "./record-orphan-regularization.js";

class DrizzleOrphanRegularizationLane<TQueryResult extends PgQueryResultHKT>
  implements OrphanRegularizationLane
{
  private readonly db: PgDatabase<TQueryResult>;
  private readonly enqueueOrphanCreditNote: EnqueueOrphanCreditNote;
  private readonly now: () => Date;

  constructor(
    db: PgDatabase<TQueryResult>,
    enqueueOrphanCreditNote: EnqueueOrphanCreditNote,
    now: () => Date,
  ) {
    this.db = db;
    this.enqueueOrphanCreditNote = enqueueOrphanCreditNote;
    this.now = now;
  }

  localStandingOfAuthorization(authorization: AuthorizationNumber): Promise<LocalStanding> {
    return localStandingOfAuthorization(this.db, authorization);
  }

  async recordOrphanRegularization(regularization: OrphanRegularization): Promise<void> {
    await this.db.transaction((tx) =>
      recordOrphanRegularization(tx, regularization, {
        at: this.now(),
        enqueueOrphanCreditNote: this.enqueueOrphanCreditNote,
      }),
    );
  }
}

export class DrizzleOrphanRegularizationLanes<TQueryResult extends PgQueryResultHKT>
  implements OrphanRegularizationLanes
{
  private readonly connections: DedicatedConnections<TQueryResult>;
  private readonly enqueueOrphanCreditNote: EnqueueOrphanCreditNote;
  private readonly now: () => Date;

  constructor(
    connections: DedicatedConnections<TQueryResult>,
    enqueueOrphanCreditNote: EnqueueOrphanCreditNote,
    now: () => Date,
  ) {
    this.connections = connections;
    this.enqueueOrphanCreditNote = enqueueOrphanCreditNote;
    this.now = now;
  }

  inPointOfSaleLane<TOutcome>(
    pointOfSale: number,
    work: (lane: OrphanRegularizationLane) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return withPointOfSaleLaneLock(this.connections, pointOfSale, (db) =>
      work(new DrizzleOrphanRegularizationLane(db, this.enqueueOrphanCreditNote, this.now)),
    );
  }
}

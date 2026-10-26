import { heldReplenishmentFailure, type RestorationEvidence } from "@purosur/domain";
import type { RestorationProtocolEvidence } from "@purosur/domain/register/use-cases";
import type { RestorePending } from "../backups/restore-pending";
import type { LocalDatabase } from "../platform/local-database";
import type { CloudReachability } from "../sync/cloud-reachability";
import { staleSequenceDetected } from "../sync/sqlite-installation-presence";
import { readPendingReplenishment } from "../sync/sqlite-register-replenishment-store";
import { registerVersionOf } from "./register-version";

export function awaitsRestoredNumbering(database: LocalDatabase): boolean {
  return (
    database
      .prepare<[], { awaiting: 1 }>(
        `SELECT 1 AS awaiting FROM awaiting_restored_numbering
         JOIN register_point_of_sale USING (register_id) LIMIT 1`,
      )
      .get() !== undefined
  );
}

export class SqliteRestorationEvidence implements RestorationProtocolEvidence {
  private readonly database: LocalDatabase;
  private readonly restorePending: RestorePending;
  private readonly cloudReachability: () => CloudReachability;
  private readonly noUsableGeneration: () => boolean;
  private readonly appVersion: string | undefined;

  constructor(
    database: LocalDatabase,
    restorePending: RestorePending,
    cloudReachability: () => CloudReachability,
    noUsableGeneration: () => boolean,
    appVersion?: string,
  ) {
    this.database = database;
    this.restorePending = restorePending;
    this.cloudReachability = cloudReachability;
    this.noUsableGeneration = noUsableGeneration;
    this.appVersion = appVersion;
  }

  evidence(): RestorationEvidence {
    const restoring = this.restorePending.isPending();
    return {
      enroll: staleSequenceDetected(this.database) && !restoring ? "pending" : "completed",
      restore: this.restoreEvidence(restoring),
      reset_sync_identity: restoring ? "pending" : "completed",
      replenish: this.replenishEvidence(),
      recover_contingency_tickets: "completed",
      reconcile_fiscal_counters: awaitsRestoredNumbering(this.database) ? "pending" : "completed",
      regularize_orphan_authorizations: this.awaitsOrphanSweep() ? "pending" : "completed",
      origin: this.replenishmentOrigin(),
      cloud: this.cloudReachability(),
    };
  }

  private restoreEvidence(restoring: boolean): "completed" | "pending" | "failed" {
    if (!restoring) {
      return "completed";
    }
    return this.noUsableGeneration() ? "failed" : "pending";
  }

  private awaitsOrphanSweep(): boolean {
    return (
      this.database
        .prepare<[], { awaiting: 1 }>("SELECT 1 AS awaiting FROM awaiting_orphan_sweep LIMIT 1")
        .get() !== undefined
    );
  }

  private replenishmentOrigin(): "copy" | "no_copy" {
    const row = this.database
      .prepare<[], { from_copy: number }>("SELECT from_copy FROM awaiting_orphan_sweep LIMIT 1")
      .get();
    return row?.from_copy === 0 ? "no_copy" : "copy";
  }

  private replenishEvidence(): RestorationEvidence["replenish"] {
    const pending = readPendingReplenishment(this.database);
    if (pending === undefined) {
      return "completed";
    }
    const held = heldReplenishmentFailure(pending.failure, registerVersionOf(this.appVersion));
    return held?.kind ?? "pending";
  }
}

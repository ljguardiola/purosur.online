import type { Clock, ZoneRulesSource } from "../../shared/index.js";
import type { InstallationStreamReach } from "../model/event-stream-reach.js";
import type { FortnightReportState } from "../model/fortnight-report.js";
import type { Fortnight } from "../model/offline-authorization-code.js";
import type { FortnightReportKey } from "./fortnight-report-ports.js";

export interface InstallationOfFortnightReport {
  registerId: string;
  installation: InstallationStreamReach;
}

export interface RevokedInstallationConfirmationRecord {
  pointOfSaleNumber: number;
  fortnight: Fortnight;
  installationId: string;
  confirmedBy: string;
  confirmedAt: Date;
}

export interface RevokedInstallationConfirmationAudit {
  pointOfSaleNumber: number;
  fortnight: Fortnight;
  installationId: string;
  registerId: string;
  revokedAt: Date;
  actorId: string;
  at: Date;
}

export interface ConfirmRevokedInstallationStoreTransaction {
  holdFortnightPresentation(key: FortnightReportKey): Promise<void>;
  /**
   * The installation of the register that owns the offline point of sale's report, when that
   * register belongs to the branch.
   */
  installationOfReport(
    key: FortnightReportKey,
    installationId: string,
    locationId: string,
  ): Promise<InstallationOfFortnightReport | null>;
  recordedReportState(key: FortnightReportKey): Promise<FortnightReportState | null>;
  confirmedInstallations(key: FortnightReportKey): Promise<string[]>;
  recordConfirmation(record: RevokedInstallationConfirmationRecord): Promise<void>;
  recordConfirmationAudit(audit: RevokedInstallationConfirmationAudit): Promise<void>;
}

export interface ConfirmRevokedInstallationStore {
  transaction<TOutcome>(
    work: (tx: ConfirmRevokedInstallationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface ConfirmRevokedInstallationUnsyncedPorts {
  store: ConfirmRevokedInstallationStore;
  clock: Clock;
  zoneRules: ZoneRulesSource;
}

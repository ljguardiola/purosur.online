import type { InstallationStreamReach } from "../../../sync/index.js";
import type { FortnightReportState } from "../../model/fortnight-report.js";
import type {
  ConfirmRevokedInstallationStore,
  ConfirmRevokedInstallationStoreTransaction,
  InstallationOfFortnightReport,
  RevokedInstallationConfirmationAudit,
  RevokedInstallationConfirmationRecord,
} from "../confirm-revoked-installation-unsynced-ports.js";
import type { FortnightReportKey } from "../fortnight-report-ports.js";

type WriteOperation = "recordConfirmation" | "recordConfirmationAudit";

interface FakeConfirmationState {
  confirmations: RevokedInstallationConfirmationRecord[];
  audits: RevokedInstallationConfirmationAudit[];
}

export const DEFAULT_LOCATION_ID = "location-1";

function keyOf({ pointOfSaleNumber, fortnight }: FortnightReportKey): string {
  return `${pointOfSaleNumber}:${fortnight.start}`;
}

export class FakeConfirmRevokedInstallationStore implements ConfirmRevokedInstallationStore {
  readonly operationOrder: string[] = [];
  readonly heldPresentations: FortnightReportKey[] = [];
  readonly failingWrites = new Set<WriteOperation>();
  private state: FakeConfirmationState = { confirmations: [], audits: [] };
  private readonly installations = new Map<
    string,
    { registerId: string; locationId: string; installation: InstallationStreamReach }
  >();
  private readonly reportStates = new Map<string, FortnightReportState>();

  seedInstallation(
    key: FortnightReportKey,
    registerId: string,
    installation: InstallationStreamReach,
    locationId = DEFAULT_LOCATION_ID,
  ): void {
    this.installations.set(`${keyOf(key)}:${installation.installationId}`, {
      registerId,
      locationId,
      installation,
    });
  }

  seedReportState(key: FortnightReportKey, state: FortnightReportState): void {
    this.reportStates.set(keyOf(key), state);
  }

  seedConfirmation(key: FortnightReportKey, installationId: string): void {
    this.state.confirmations.push({
      pointOfSaleNumber: key.pointOfSaleNumber,
      fortnight: key.fortnight,
      installationId,
      confirmedBy: "earlier-actor",
      confirmedAt: new Date("2026-10-10T12:00:00.000Z"),
    });
  }

  snapshot(): FakeConfirmationState {
    return structuredClone(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: ConfirmRevokedInstallationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(this.transactionOver());
    } catch (error) {
      this.state = before;
      throw error;
    }
  }

  private transactionOver(): ConfirmRevokedInstallationStoreTransaction {
    const order = this.operationOrder;
    const write = (operation: WriteOperation) => {
      order.push(operation);
      if (this.failingWrites.has(operation)) {
        throw new Error(`${operation} failed`);
      }
    };
    return {
      holdFortnightPresentation: async (key) => {
        order.push("holdFortnightPresentation");
        this.heldPresentations.push(key);
      },
      installationOfReport: async (
        key,
        installationId,
        locationId,
      ): Promise<InstallationOfFortnightReport | null> => {
        order.push("installationOfReport");
        const found = this.installations.get(`${keyOf(key)}:${installationId}`);
        return found !== undefined && found.locationId === locationId
          ? { registerId: found.registerId, installation: found.installation }
          : null;
      },
      recordedReportState: async (key) => {
        order.push("recordedReportState");
        return this.reportStates.get(keyOf(key)) ?? null;
      },
      confirmedInstallations: async (key) => {
        order.push("confirmedInstallations");
        return this.state.confirmations
          .filter(
            ({ pointOfSaleNumber, fortnight }) =>
              keyOf({ pointOfSaleNumber, fortnight }) === keyOf(key),
          )
          .map(({ installationId }) => installationId);
      },
      recordConfirmation: async (record) => {
        write("recordConfirmation");
        this.state.confirmations.push(structuredClone(record));
      },
      recordConfirmationAudit: async (audit) => {
        write("recordConfirmationAudit");
        this.state.audits.push(structuredClone(audit));
      },
    };
  }
}

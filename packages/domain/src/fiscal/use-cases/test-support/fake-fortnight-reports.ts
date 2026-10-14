import type { InstallationStreamReach } from "../../../sync/index.js";
import type { Fortnight } from "../../model/offline-authorization-code.js";
import type {
  FortnightReportChange,
  FortnightReportKey,
  FortnightReportStore,
  HeldFortnightReport,
  NoMovementDeclarationAnswer,
  NoMovementDeclarationCall,
  NoMovementDeclarationLookupAnswer,
  OfflineDocumentsOfFortnight,
  OwedFortnightReport,
  RecordedFortnightReport,
  RegisterEventStreams,
  TaxAuthorityNoMovementDeclarations,
} from "../fortnight-report-ports.js";
import type { FakeOfflineAuthorizationCodeStore } from "./fake-offline-authorization-codes.js";

export interface OfflinePointOfSaleOfRegister {
  pointOfSaleNumber: number;
  registerId: string;
}

function keyOf({ pointOfSaleNumber, fortnight }: FortnightReportKey): string {
  return `${pointOfSaleNumber}:${fortnight.start}`;
}

class FakeHeldReport implements HeldFortnightReport {
  private readonly store: FakeFortnightReportStore;
  private readonly key: FortnightReportKey;

  constructor(store: FakeFortnightReportStore, key: FortnightReportKey) {
    this.store = store;
    this.key = key;
  }

  async recorded(): Promise<RecordedFortnightReport | null> {
    const recorded = this.store.recordedReports.get(keyOf(this.key));
    return recorded === undefined ? null : { ...recorded };
  }

  async record(change: FortnightReportChange): Promise<void> {
    this.store.operations.push(`record ${change.state}`);
    this.store.changes.push({ ...this.key, change });
    this.store.recordedReports.set(keyOf(this.key), {
      state: change.state,
      lastAttemptAt: new Date(change.at),
    });
  }
}

export class FakeFortnightReportStore implements FortnightReportStore {
  readonly operations: string[];
  readonly changes: (FortnightReportKey & { change: FortnightReportChange })[] = [];
  readonly recordedReports = new Map<string, RecordedFortnightReport>();
  readonly heldKeys = new Set<string>();
  pointsOfSale: OfflinePointOfSaleOfRegister[] = [];
  private readonly codes: FakeOfflineAuthorizationCodeStore;

  constructor(codes: FakeOfflineAuthorizationCodeStore, operations: string[]) {
    this.codes = codes;
    this.operations = operations;
  }

  seed(key: FortnightReportKey, recorded: RecordedFortnightReport): void {
    this.recordedReports.set(keyOf(key), recorded);
  }

  async owedReports(today: string): Promise<OwedFortnightReport[]> {
    this.operations.push("owedReports");
    return this.codes.kept
      .filter(({ code }) => code.fortnight.end < today)
      .flatMap(({ code }) =>
        this.pointsOfSale
          .filter(
            ({ pointOfSaleNumber }) =>
              this.recordedReports.get(keyOf({ pointOfSaleNumber, fortnight: code.fortnight }))
                ?.state !== "accepted",
          )
          .map(({ pointOfSaleNumber, registerId }) => ({ pointOfSaleNumber, registerId, code })),
      );
  }

  async holdReport<TOutcome>(
    key: FortnightReportKey,
    work: (report: HeldFortnightReport) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.operations.push(`hold ${keyOf(key)}`);
    this.heldKeys.add(keyOf(key));
    try {
      return await work(new FakeHeldReport(this, key));
    } finally {
      this.heldKeys.delete(keyOf(key));
      this.operations.push(`release ${keyOf(key)}`);
    }
  }
}

export class FakeOfflineDocumentsOfFortnight implements OfflineDocumentsOfFortnight {
  readonly counts = new Map<string, number>();
  private readonly operations: string[];

  constructor(operations: string[]) {
    this.operations = operations;
  }

  set(pointOfSaleNumber: number, fortnight: Fortnight, count: number): void {
    this.counts.set(keyOf({ pointOfSaleNumber, fortnight }), count);
  }

  async countOn(pointOfSaleNumber: number, fortnight: Fortnight): Promise<number> {
    this.operations.push("countOn");
    return this.counts.get(keyOf({ pointOfSaleNumber, fortnight })) ?? 0;
  }
}

export class FakeRegisterEventStreams implements RegisterEventStreams {
  readonly installations = new Map<string, InstallationStreamReach[]>();

  async installationsOf(registerId: string): Promise<InstallationStreamReach[]> {
    return this.installations.get(registerId) ?? [];
  }
}

export interface RecordedDeclarationCall extends NoMovementDeclarationCall {
  heldDuringCall: boolean;
}

export class FakeTaxAuthorityNoMovementDeclarations implements TaxAuthorityNoMovementDeclarations {
  readonly lookUps: RecordedDeclarationCall[] = [];
  readonly declarations: RecordedDeclarationCall[] = [];
  lookUpAnswer: (call: NoMovementDeclarationCall) => NoMovementDeclarationLookupAnswer = () => ({
    kind: "not_held",
  });
  declareAnswer: (call: NoMovementDeclarationCall) => NoMovementDeclarationAnswer = () => ({
    kind: "accepted",
  });
  private readonly operations: string[];
  private readonly reports: FakeFortnightReportStore;

  constructor(reports: FakeFortnightReportStore, operations: string[]) {
    this.reports = reports;
    this.operations = operations;
  }

  async lookUp(call: NoMovementDeclarationCall): Promise<NoMovementDeclarationLookupAnswer> {
    this.operations.push("tax authority lookUp");
    this.lookUps.push({ ...call, heldDuringCall: this.reports.heldKeys.size > 0 });
    return this.lookUpAnswer(call);
  }

  async declare(call: NoMovementDeclarationCall): Promise<NoMovementDeclarationAnswer> {
    this.operations.push("tax authority declare");
    this.declarations.push({ ...call, heldDuringCall: this.reports.heldKeys.size > 0 });
    return this.declareAnswer(call);
  }
}

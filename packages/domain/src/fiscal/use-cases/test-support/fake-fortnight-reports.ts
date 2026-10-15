import type { InstallationStreamReach } from "../../../sync/index.js";
import type { FiscalDocumentType } from "../../model/fiscal-rejection-standing.js";
import {
  isFortnightReportOutstanding,
  isOfflineDocumentReported,
  owesFortnightReport,
} from "../../model/fortnight-report.js";
import type { Fortnight } from "../../model/offline-authorization-code.js";
import type {
  DocumentTypeReportChange,
  FortnightReportChange,
  FortnightReportKey,
  FortnightReportStore,
  HeldFortnightReport,
  NoMovementDeclarationAnswer,
  NoMovementDeclarationCall,
  NoMovementDeclarationLookupAnswer,
  OfflineDocumentBatchLimitAnswer,
  OfflineDocumentLastReportedAnswer,
  OfflineDocumentLastReportedCall,
  OfflineDocumentOfFortnight,
  OfflineDocumentReportAnswer,
  OfflineDocumentReportCall,
  OfflineDocumentsOfFortnight,
  OwedFortnightReport,
  RecordedFortnightReport,
  RegisterEventStreams,
  TaxAuthorityNoMovementDeclarations,
  TaxAuthorityOfflineDocumentReports,
} from "../fortnight-report-ports.js";
import type { WsaaToken } from "../wsaa-token-ports.js";
import type { FakeOfflineAuthorizationCodeStore } from "./fake-offline-authorization-codes.js";

export interface OfflinePointOfSaleOfRegister {
  pointOfSaleNumber: number;
  registerId: string;
  claimedAt: Date;
}

function keyOf({ pointOfSaleNumber, fortnight }: FortnightReportKey): string {
  return `${pointOfSaleNumber}:${fortnight.start}`;
}

function typeKeyOf(key: FortnightReportKey, documentType: string): string {
  return `${keyOf(key)}:${documentType}`;
}

export function offlineDocument(
  number: number,
  overrides: Partial<OfflineDocumentOfFortnight> = {},
): OfflineDocumentOfFortnight {
  return {
    documentType: "factura_c",
    number,
    issuedOn: "2026-09-20",
    generatedAt: new Date("2026-09-20T15:00:00.000Z"),
    buyerDocumentType: 99,
    buyerDocumentNumber: 0,
    buyerTaxStatusCode: 5,
    total: 15_000,
    netAmount: 15_000,
    ...overrides,
  };
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
      movement: change.movement ?? null,
      lastAttemptAt: new Date(change.at),
    });
  }

  async recordDocumentType(change: DocumentTypeReportChange): Promise<void> {
    this.store.operations.push(`record ${change.documentType} ${change.state}`);
    this.store.documentTypeChanges.push({ ...this.key, change });
    this.store.reportedThrough.set(
      typeKeyOf(this.key, change.documentType),
      change.reportedThrough,
    );
  }
}

export class FakeFortnightReportStore implements FortnightReportStore {
  readonly operations: string[];
  readonly changes: (FortnightReportKey & { change: FortnightReportChange })[] = [];
  readonly documentTypeChanges: (FortnightReportKey & { change: DocumentTypeReportChange })[] = [];
  readonly recordedReports = new Map<string, RecordedFortnightReport>();
  readonly reportedThrough = new Map<string, number | null>();
  readonly heldKeys = new Set<string>();
  pointsOfSale: OfflinePointOfSaleOfRegister[] = [];
  private readonly codes: FakeOfflineAuthorizationCodeStore;
  private readonly documents: FakeOfflineDocumentsOfFortnight;

  constructor(
    codes: FakeOfflineAuthorizationCodeStore,
    documents: FakeOfflineDocumentsOfFortnight,
    operations: string[],
  ) {
    this.codes = codes;
    this.documents = documents;
    this.operations = operations;
  }

  seed(key: FortnightReportKey, recorded: RecordedFortnightReport): void {
    this.recordedReports.set(keyOf(key), recorded);
  }

  seedReportedThrough(
    key: FortnightReportKey,
    documentType: FiscalDocumentType,
    reportedThrough: number,
  ): void {
    this.reportedThrough.set(typeKeyOf(key, documentType), reportedThrough);
  }

  async acceptedWithUnreportedDocuments(): Promise<OwedFortnightReport[]> {
    this.operations.push("acceptedWithUnreportedDocuments");
    return this.codes.kept.flatMap(({ code }) =>
      this.pointsOfSale
        .filter(({ pointOfSaleNumber }) => {
          const key = { pointOfSaleNumber, fortnight: code.fortnight };
          return (
            this.recordedReports.get(keyOf(key))?.state === "accepted" &&
            this.documents
              .of(pointOfSaleNumber, code.fortnight)
              .some(
                ({ documentType, number }) =>
                  !isOfflineDocumentReported(
                    number,
                    this.reportedThrough.get(typeKeyOf(key, documentType)) ?? null,
                  ),
              )
          );
        })
        .map(({ pointOfSaleNumber, registerId }) => ({ pointOfSaleNumber, registerId, code })),
    );
  }

  async owedReports(today: string): Promise<OwedFortnightReport[]> {
    this.operations.push("owedReports");
    return this.codes.kept.flatMap(({ code }) =>
      this.pointsOfSale
        .filter(
          ({ pointOfSaleNumber, claimedAt }) =>
            owesFortnightReport({ fortnight: code.fortnight, claimedAt }, today) &&
            isFortnightReportOutstanding(
              this.recordedReports.get(keyOf({ pointOfSaleNumber, fortnight: code.fortnight }))
                ?.state ?? null,
            ),
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
  private readonly documents = new Map<string, OfflineDocumentOfFortnight[]>();
  private readonly operations: string[];

  constructor(operations: string[]) {
    this.operations = operations;
  }

  add(
    pointOfSaleNumber: number,
    fortnight: Fortnight,
    ...documents: OfflineDocumentOfFortnight[]
  ): void {
    const key = keyOf({ pointOfSaleNumber, fortnight });
    this.documents.set(key, [...(this.documents.get(key) ?? []), ...documents]);
  }

  of(pointOfSaleNumber: number, fortnight: Fortnight): OfflineDocumentOfFortnight[] {
    return [...(this.documents.get(keyOf({ pointOfSaleNumber, fortnight })) ?? [])];
  }

  async documentsOn(
    pointOfSaleNumber: number,
    fortnight: Fortnight,
  ): Promise<OfflineDocumentOfFortnight[]> {
    this.operations.push("documentsOn");
    return this.of(pointOfSaleNumber, fortnight);
  }
}

export class FakeRegisterEventStreams implements RegisterEventStreams {
  readonly installations = new Map<string, InstallationStreamReach[]>();
  private readonly operations: string[];

  constructor(operations: string[]) {
    this.operations = operations;
  }

  async installationsOf(registerId: string): Promise<InstallationStreamReach[]> {
    this.operations.push("installationsOf");
    return this.installations.get(registerId) ?? [];
  }
}

export interface RecordedOfflineDocumentReportCall extends OfflineDocumentReportCall {
  heldDuringCall: boolean;
}

export class FakeTaxAuthorityOfflineDocumentReports implements TaxAuthorityOfflineDocumentReports {
  readonly lastReportedCalls: OfflineDocumentLastReportedCall[] = [];
  readonly batchLimitCalls: WsaaToken[] = [];
  readonly reports: RecordedOfflineDocumentReportCall[] = [];
  readonly held = new Map<string, number>();
  limit = 250;
  lastReportedAnswer:
    | ((call: OfflineDocumentLastReportedCall) => OfflineDocumentLastReportedAnswer)
    | null = null;
  batchLimitAnswer: (() => OfflineDocumentBatchLimitAnswer) | null = null;
  reportAnswer: (call: OfflineDocumentReportCall) => OfflineDocumentReportAnswer = () => ({
    kind: "accepted",
  });
  private readonly operations: string[];
  private readonly reportsStore: FakeFortnightReportStore;

  constructor(reportsStore: FakeFortnightReportStore, operations: string[]) {
    this.reportsStore = reportsStore;
    this.operations = operations;
  }

  hold(pointOfSaleNumber: number, documentType: FiscalDocumentType, number: number): void {
    this.held.set(`${pointOfSaleNumber}:${documentType}`, number);
  }

  async lastReported(
    call: OfflineDocumentLastReportedCall,
  ): Promise<OfflineDocumentLastReportedAnswer> {
    this.operations.push(`tax authority lastReported ${call.documentType}`);
    this.lastReportedCalls.push(call);
    return (
      this.lastReportedAnswer?.(call) ?? {
        kind: "read",
        number: this.held.get(`${call.pointOfSaleNumber}:${call.documentType}`) ?? 0,
      }
    );
  }

  async batchLimit(token: WsaaToken): Promise<OfflineDocumentBatchLimitAnswer> {
    this.operations.push("tax authority batchLimit");
    this.batchLimitCalls.push(token);
    return this.batchLimitAnswer?.() ?? { kind: "read", limit: this.limit };
  }

  async report(call: OfflineDocumentReportCall): Promise<OfflineDocumentReportAnswer> {
    this.operations.push(`tax authority report ${call.documentType}`);
    this.reports.push({ ...call, heldDuringCall: this.reportsStore.heldKeys.size > 0 });
    const answer = this.reportAnswer(call);
    const key = `${call.pointOfSaleNumber}:${call.documentType}`;
    if (answer.kind === "accepted") {
      this.held.set(key, call.documents.at(-1)?.number ?? this.held.get(key) ?? 0);
    }
    if (answer.kind === "rejected") {
      this.held.set(key, answer.number - 1);
    }
    return answer;
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

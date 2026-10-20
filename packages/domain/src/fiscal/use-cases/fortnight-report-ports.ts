import type { Clock } from "../../shared/index.js";
import type { InstallationStreamReach } from "../../sync/index.js";
import type {
  FiscalDocumentType,
  TaxAuthorityRejection,
} from "../model/fiscal-rejection-standing.js";
import type {
  DocumentTypeReportState,
  FortnightReportMovement,
  FortnightReportState,
} from "../model/fortnight-report.js";
import type { Fortnight } from "../model/offline-authorization-code.js";
import type { WithOwedPresentations } from "../model/owed-presentation-list.js";
import type { WsaaTokenSource } from "./fiscal-document-authorization-ports.js";
import type {
  OfflineAuthorizationCode,
  OfflineAuthorizationCodeStore,
  TaxAuthorityOfflineAuthorizationCodes,
} from "./offline-authorization-code-ports.js";
import type { OwedPresentationList } from "./owed-presentation-list-ports.js";
import type { WsaaToken } from "./wsaa-token-ports.js";

export interface OwedFortnightReport {
  pointOfSaleNumber: number;
  registerId: string;
  code: OfflineAuthorizationCode;
}

export interface FortnightReportKey {
  pointOfSaleNumber: number;
  fortnight: Fortnight;
}

export interface RecordedFortnightReport {
  state: FortnightReportState;
  movement: FortnightReportMovement | null;
  lastAttemptAt: Date | null;
}

export interface FortnightReportChange {
  state: FortnightReportState;
  at: Date;
  movement?: FortnightReportMovement;
  rejections?: TaxAuthorityRejection[];
}

export interface DocumentTypeReportChange {
  documentType: FiscalDocumentType;
  state: DocumentTypeReportState;
  at: Date;
  reportedThrough: number;
  rejectedNumber?: number;
  rejections?: TaxAuthorityRejection[];
}

export interface HeldFortnightReport {
  recorded(): Promise<RecordedFortnightReport | null>;
  record(change: FortnightReportChange): Promise<void>;
  recordDocumentType(change: DocumentTypeReportChange): Promise<void>;
}

export interface FortnightReportStore {
  owedReports(today: string): Promise<OwedFortnightReport[]>;
  acceptedWithUnreportedDocuments(): Promise<OwedFortnightReport[]>;
  holdReport<TOutcome>(
    key: FortnightReportKey,
    work: (report: HeldFortnightReport) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface OfflineDocumentOfFortnight {
  documentType: FiscalDocumentType;
  number: number;
  issuedOn: string;
  generatedAt: Date;
  buyerDocumentType: number;
  buyerDocumentNumber: number;
  buyerTaxStatusCode: number;
  total: number;
  netAmount: number;
}

export interface OfflineDocumentsOfFortnight {
  documentsOn(
    pointOfSaleNumber: number,
    fortnight: Fortnight,
  ): Promise<OfflineDocumentOfFortnight[]>;
}

export interface RegisterEventStreams {
  installationsOf(registerId: string): Promise<InstallationStreamReach[]>;
}

export interface NoMovementDeclarationCall {
  token: WsaaToken;
  pointOfSaleNumber: number;
  code: string;
}

export type NoMovementDeclarationLookupAnswer =
  | { kind: "held" }
  | { kind: "not_held" }
  | { kind: "refused"; rejections: TaxAuthorityRejection[] }
  | { kind: "no_answer" };

export type NoMovementDeclarationAnswer =
  | { kind: "accepted" }
  | { kind: "refused"; rejections: TaxAuthorityRejection[] }
  | { kind: "no_answer" };

export interface TaxAuthorityNoMovementDeclarations {
  lookUp(call: NoMovementDeclarationCall): Promise<NoMovementDeclarationLookupAnswer>;
  declare(call: NoMovementDeclarationCall): Promise<NoMovementDeclarationAnswer>;
}

export interface OfflineDocumentLastReportedCall {
  token: WsaaToken;
  pointOfSaleNumber: number;
  documentType: FiscalDocumentType;
}

export type OfflineDocumentLastReportedAnswer =
  | { kind: "read"; number: number }
  | { kind: "refused"; rejections: TaxAuthorityRejection[] }
  | { kind: "no_answer" };

export type OfflineDocumentBatchLimitAnswer =
  | { kind: "read"; limit: number }
  | { kind: "refused"; rejections: TaxAuthorityRejection[] }
  | { kind: "no_answer" };

export interface OfflineDocumentReportCall {
  token: WsaaToken;
  pointOfSaleNumber: number;
  documentType: FiscalDocumentType;
  code: string;
  documents: OfflineDocumentOfFortnight[];
}

export type OfflineDocumentReportAnswer = WithOwedPresentations<
  | { kind: "accepted" }
  | { kind: "rejected"; number: number; rejections: TaxAuthorityRejection[] }
  | { kind: "refused"; rejections: TaxAuthorityRejection[] }
  | { kind: "no_answer" }
>;

export interface TaxAuthorityOfflineDocumentReports {
  lastReported(call: OfflineDocumentLastReportedCall): Promise<OfflineDocumentLastReportedAnswer>;
  batchLimit(token: WsaaToken): Promise<OfflineDocumentBatchLimitAnswer>;
  report(call: OfflineDocumentReportCall): Promise<OfflineDocumentReportAnswer>;
}

export interface FortnightReportPorts {
  reports: FortnightReportStore;
  documents: OfflineDocumentsOfFortnight;
  streams: RegisterEventStreams;
  declarations: TaxAuthorityNoMovementDeclarations;
  documentReports: TaxAuthorityOfflineDocumentReports;
  codeStore: OfflineAuthorizationCodeStore;
  codeAuthority: TaxAuthorityOfflineAuthorizationCodes;
  owedPresentations: OwedPresentationList;
  tokens: WsaaTokenSource;
  clock: Clock;
}

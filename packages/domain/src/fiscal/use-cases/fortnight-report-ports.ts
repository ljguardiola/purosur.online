import type { Clock } from "../../shared/index.js";
import type { InstallationStreamReach } from "../../sync/index.js";
import type { TaxAuthorityRejection } from "../model/fiscal-rejection-standing.js";
import type { FortnightReportState } from "../model/fortnight-report.js";
import type { Fortnight } from "../model/offline-authorization-code.js";
import type { WsaaTokenSource } from "./fiscal-document-authorization-ports.js";
import type {
  OfflineAuthorizationCode,
  OfflineAuthorizationCodeStore,
  TaxAuthorityOfflineAuthorizationCodes,
} from "./offline-authorization-code-ports.js";
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
  lastAttemptAt: Date | null;
}

export interface FortnightReportChange {
  state: FortnightReportState;
  at: Date;
  rejections?: TaxAuthorityRejection[];
}

export interface HeldFortnightReport {
  recorded(): Promise<RecordedFortnightReport | null>;
  record(change: FortnightReportChange): Promise<void>;
}

export interface FortnightReportStore {
  owedReports(today: string): Promise<OwedFortnightReport[]>;
  holdReport<TOutcome>(
    key: FortnightReportKey,
    work: (report: HeldFortnightReport) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface OfflineDocumentsOfFortnight {
  countOn(pointOfSaleNumber: number, fortnight: Fortnight): Promise<number>;
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

export interface FortnightReportPorts {
  reports: FortnightReportStore;
  documents: OfflineDocumentsOfFortnight;
  streams: RegisterEventStreams;
  declarations: TaxAuthorityNoMovementDeclarations;
  codeStore: OfflineAuthorizationCodeStore;
  codeAuthority: TaxAuthorityOfflineAuthorizationCodes;
  tokens: WsaaTokenSource;
  clock: Clock;
}

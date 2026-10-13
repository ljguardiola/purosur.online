import type { Clock } from "../../shared/index.js";
import type { Fortnight } from "../model/offline-authorization-code.js";
import type { OfflineAuthorizationCodeAcquisitionUrgency } from "../model/offline-authorization-code-acquisition-urgency.js";
import type { FortnightAcquisitionOutcome } from "./obtain-offline-authorization-codes.js";

export type ReportableAcquisitionFailure = Extract<
  FortnightAcquisitionOutcome,
  { kind: "refused" | "no_answer" | "not_recovered" }
>;

export type ReportableAcquisitionFailureKind = ReportableAcquisitionFailure["kind"];

export interface AcquisitionFailureNotice {
  fortnight: Fortnight;
  outcome: ReportableAcquisitionFailure;
  urgency: Extract<OfflineAuthorizationCodeAcquisitionUrgency, "due" | "pressing">;
}

export interface AcquisitionFailureReportStore {
  recordFirstReport(fortnight: Fortnight, kind: ReportableAcquisitionFailureKind): Promise<boolean>;
}

export interface AcquisitionFailureNotifier {
  failureNeedsAttention(notice: AcquisitionFailureNotice): Promise<void>;
}

export interface AcquisitionFailureReportPorts {
  store: AcquisitionFailureReportStore;
  notifier: AcquisitionFailureNotifier;
  clock: Clock;
}

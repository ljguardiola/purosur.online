import type { Fortnight } from "../../model/offline-authorization-code.js";
import type {
  AcquisitionFailureNotice,
  AcquisitionFailureNotifier,
  AcquisitionFailureReportStore,
  ReportableAcquisitionFailureKind,
} from "../report-offline-authorization-code-acquisition-failures-ports.js";

export class FakeAcquisitionFailureReportStore implements AcquisitionFailureReportStore {
  readonly events: string[] = [];
  private readonly recorded = new Set<string>();

  async recordFirstReport(
    fortnight: Fortnight,
    kind: ReportableAcquisitionFailureKind,
  ): Promise<boolean> {
    const key = `${fortnight.start}:${kind}`;
    this.events.push(`record ${key}`);
    if (this.recorded.has(key)) {
      return false;
    }
    this.recorded.add(key);
    return true;
  }
}

export class FakeAcquisitionFailureNotifier implements AcquisitionFailureNotifier {
  readonly notices: AcquisitionFailureNotice[] = [];

  constructor(private readonly events: string[] = []) {}

  async failureNeedsAttention(notice: AcquisitionFailureNotice): Promise<void> {
    this.events.push(`notify ${notice.fortnight.start}:${notice.outcome.kind}`);
    this.notices.push(structuredClone(notice));
  }
}

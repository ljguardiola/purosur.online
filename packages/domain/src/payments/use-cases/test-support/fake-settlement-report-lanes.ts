import type {
  SettlementReportLanes,
  SettlementReportStore,
} from "../mercado-pago-settlement-report-ports.js";
import { FakeSettlementReportStore } from "./fake-settlement-report-store.js";

export class FakeSettlementReportLanes implements SettlementReportLanes {
  readonly store = new FakeSettlementReportStore();
  held = false;

  async inSettlementReportLane<TOutcome>(
    work: (store: SettlementReportStore) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.held = true;
    try {
      return await work(this.store);
    } finally {
      this.held = false;
    }
  }
}

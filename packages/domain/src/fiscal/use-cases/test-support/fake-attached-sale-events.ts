import type { PushedEvent } from "../../../sync/index.js";
import type { AttachedSaleEvents } from "../attached-sale-event-ports.js";
import type { FakePointOfSaleLanes } from "./fake-fiscal-document-authorization.js";

export class FakeAttachedSaleEvents implements AttachedSaleEvents {
  readonly recorded: { deviceId: string; event: PushedEvent }[] = [];
  failure: Error | undefined;
  private readonly lanes: FakePointOfSaleLanes;

  constructor(lanes: FakePointOfSaleLanes) {
    this.lanes = lanes;
  }

  async record(deviceId: string, event: PushedEvent): Promise<void> {
    this.lanes.operations.push("recordAttachedSaleEvent");
    if (this.failure !== undefined) {
      throw this.failure;
    }
    this.recorded.push({ deviceId, event });
  }
}

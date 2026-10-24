import type { PushedEvent } from "../../../sync/index.js";
import type { AttachedSaleEvents } from "../attached-sale-event-ports.js";

export class FakeAttachedSaleEvents implements AttachedSaleEvents {
  readonly recorded: { deviceId: string; event: PushedEvent }[] = [];
  failure: Error | undefined;
  private readonly lanes: { readonly operations: string[] };

  constructor(lanes: { readonly operations: string[] }) {
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

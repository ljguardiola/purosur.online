import type { PushedEvent } from "../../sync/index.js";

export interface AttachedSaleEvents {
  record(deviceId: string, event: PushedEvent): Promise<void>;
}

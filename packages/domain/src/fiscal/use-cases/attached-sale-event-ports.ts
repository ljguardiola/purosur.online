import type { PushedEvent } from "../../shared/index.js";

export interface AttachedSaleEvents {
  record(deviceId: string, event: PushedEvent): Promise<void>;
}

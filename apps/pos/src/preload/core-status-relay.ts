import { isCoreStatusRequest } from "../shared/core-status-request";

export interface CoreStatusRelay {
  fromMain(message: unknown): void;
  fromPage(data: unknown): void;
}

const CORE_STATUS_CHANNEL = "core-status";

export function createCoreStatusRelay(postToPage: (data: unknown) => void): CoreStatusRelay {
  let latest: { message: unknown } | undefined;

  function relay(message: unknown): void {
    postToPage({ channel: CORE_STATUS_CHANNEL, payload: message });
  }

  return {
    fromMain(message) {
      latest = { message };
      relay(message);
    },
    fromPage(data) {
      if (latest !== undefined && isCoreStatusRequest(data)) {
        relay(latest.message);
      }
    },
  };
}

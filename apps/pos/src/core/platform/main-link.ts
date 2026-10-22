import { createHeldMessages } from "./held-messages";
import { createMainRequests } from "./main-requests";
import type { DeviceCredentialsRequest } from "@purosur/contracts";

interface MainPort<TEvent> {
  on(event: "message", listener: (event: TEvent) => void): unknown;
  postMessage(message: DeviceCredentialsRequest): void;
}

export function createMainLink<TEvent extends { data: unknown }>(deps: {
  parentPort: MainPort<TEvent>;
  newRequestId: () => string;
}) {
  const mainRequests = createMainRequests({
    post: (message) => deps.parentPort.postMessage(message),
    newRequestId: deps.newRequestId,
  });
  const fromMain = createHeldMessages<TEvent>();
  deps.parentPort.on("message", fromMain.receive);
  return { mainRequests, deliverTo: fromMain.deliverTo };
}

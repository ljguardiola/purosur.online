import { type DeviceCredentialsRequest, deviceCredentialsAnswerSchema } from "@purosur/contracts";
import { createHeldMessages } from "./held-messages";
import { createMainRequests } from "./main-requests";

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
  const fromMain = createHeldMessages<TEvent>((event) => {
    const answer = deviceCredentialsAnswerSchema.safeParse(event.data);
    if (!answer.success) {
      return false;
    }
    mainRequests.receive(answer.data);
    return true;
  });
  deps.parentPort.on("message", fromMain.receive);
  return { mainRequests, deliverTo: fromMain.deliverTo };
}

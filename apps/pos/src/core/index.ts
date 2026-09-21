import { mainToCoreMessageSchema, rendererToCoreMessageSchema } from "@purosur/contracts";
import { createMessageGate, type RejectionRecorder } from "./message-gate";

// Forwarded to Sentry once it is initialized in this process (see the build & packaging task);
// until then a rejection is at least never silently dropped.
const recorder: RejectionRecorder = {
  recordRejection(rejection) {
    console.error("core: rejected message", rejection);
  },
};

const gateFromMain = createMessageGate(mainToCoreMessageSchema, recorder);
const gateFromRenderer = createMessageGate(rendererToCoreMessageSchema, recorder);

function handleMainMessage(): void {
  // No business logic yet: the gate existing and wired up is what this shell proves.
}

function handleRendererMessage(): void {
  // No business logic yet: the gate existing and wired up is what this shell proves.
}

process.parentPort.on("message", (event) => {
  const [rendererPort] = event.ports;
  if (rendererPort) {
    rendererPort.on("message", (portEvent) => {
      gateFromRenderer(portEvent.data, handleRendererMessage);
    });
    rendererPort.start();
    return;
  }

  gateFromMain(event.data, handleMainMessage);
});

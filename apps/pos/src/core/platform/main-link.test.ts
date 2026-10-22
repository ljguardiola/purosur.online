import type { DeviceCredentialsRequest } from "@purosur/contracts";
import { describe, expect, it } from "vitest";
import { createMainLink } from "./main-link";

interface FakeEvent {
  data: unknown;
  ports: unknown[];
}

function link() {
  let listener: ((event: FakeEvent) => void) | undefined;
  const posted: DeviceCredentialsRequest[] = [];
  let next = 0;
  const mainLink = createMainLink<FakeEvent>({
    parentPort: {
      on(_event, receive) {
        listener = receive;
      },
      postMessage(message) {
        posted.push(message);
      },
    },
    newRequestId: () => `request-${++next}`,
  });
  return {
    ...mainLink,
    posted,
    arrive(event: FakeEvent) {
      listener?.(event);
    },
  };
}

const credentials = { device_id: "device-1", device_token: "token", pepper: "pepper" };

async function settled<T>(promise: Promise<T>): Promise<{ value: T } | "pending"> {
  let outcome: { value: T } | "pending" = "pending";
  promise.then((value) => {
    outcome = { value };
  });
  for (let tick = 0; tick < 5; tick++) {
    await Promise.resolve();
  }
  return outcome;
}

describe("the register core's link to main", () => {
  it("resolves a credentials read from main's answer before the core delivers its messages", async () => {
    const { mainRequests, posted, arrive } = link();

    const read = mainRequests.readCredentials();
    expect(posted).toEqual([{ type: "device-credentials-read-request", request_id: "request-1" }]);
    arrive({
      data: { type: "device-credentials-read", request_id: "request-1", credentials },
      ports: [],
    });

    expect(await settled(read)).toEqual({ value: credentials });
  });

  it("holds the renderer port and every other message until the core delivers", () => {
    const { arrive, deliverTo } = link();
    const delivered: unknown[] = [];
    const rendererPort = { data: undefined, ports: [{}] };
    const holdRelease = { data: { type: "update-hold-release" }, ports: [] };

    arrive(rendererPort);
    arrive(holdRelease);
    expect(delivered).toEqual([]);
    deliverTo((event) => delivered.push(event));

    expect(delivered).toEqual([rendererPort, holdRelease]);
  });

  it("keeps the order of the held messages around an answer that was handled early", async () => {
    const { mainRequests, arrive, deliverTo } = link();
    const delivered: unknown[] = [];
    const first = { data: { type: "update-hold-release" }, ports: [] };
    const second = { data: { type: "health-check" }, ports: [] };

    const present = mainRequests.credentialsPresent();
    arrive(first);
    arrive({
      data: { type: "device-credentials-presence", request_id: "request-1", present: true },
      ports: [],
    });
    arrive(second);
    deliverTo((event) => delivered.push(event));

    expect(await settled(present)).toEqual({ value: true });
    expect(delivered).toEqual([first, second]);
  });
});

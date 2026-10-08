import { FICTIONAL_CUIT } from "@purosur/domain/fiscal/test-support";
import {
  addBreadcrumb,
  Client,
  type ClientOptions,
  consoleLoggingIntegration,
  type Envelope,
  type Event,
  setCurrentClient,
} from "@sentry/core";
import { afterEach, describe, expect, it } from "vitest";
import { errorReportingOptions } from "./error-reporting-options.js";

class RecordingClient extends Client {
  constructor(options: ClientOptions) {
    super(options);
  }

  eventFromException(exception: unknown): PromiseLike<Event> {
    return Promise.resolve({
      exception: { values: [{ type: "Error", value: String(exception) }] },
    });
  }

  eventFromMessage(message: string): PromiseLike<Event> {
    return Promise.resolve({ message });
  }
}

interface RecordingSentry {
  client: Client;
  items: () => { type: string; payload: Record<string, unknown> }[];
}

const started: RecordingSentry[] = [];

function startSentry(): RecordingSentry {
  const envelopes: Envelope[] = [];
  const client = new RecordingClient({
    dsn: "https://public@errors.example.test/1",
    stackParser: () => [],
    transport: () => ({
      send: (envelope) => {
        envelopes.push(envelope);
        return Promise.resolve({});
      },
      flush: () => Promise.resolve(true),
    }),
    integrations: [consoleLoggingIntegration({ levels: ["info", "warn", "error"] })],
    ...errorReportingOptions(),
  });
  setCurrentClient(client);
  client.init();
  const sentry: RecordingSentry = {
    client,
    items: () =>
      envelopes.flatMap(([, envelopeItems]) =>
        envelopeItems.map(([header, payload]) => ({
          type: String(header.type),
          payload: payload as Record<string, unknown>,
        })),
      ),
  };
  started.push(sentry);
  return sentry;
}

async function sentItems(sentry: RecordingSentry, type: string) {
  await sentry.client.flush();
  return sentry.items().filter((item) => item.type === type);
}

afterEach(async () => {
  await Promise.all(started.splice(0).map((sentry) => sentry.client.close()));
});

describe("errorReportingOptions", () => {
  it("collects nothing from any category", () => {
    expect(errorReportingOptions().dataCollection).toStrictEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    });
  });

  it("returns a fresh object each time, so one init cannot change another's", () => {
    const first = errorReportingOptions();

    first.dataCollection.httpBodies.push("incomingRequest");

    expect(errorReportingOptions().dataCollection.httpBodies).toStrictEqual([]);
  });

  it("ships a console error line as a Sentry log with its personal data redacted", async () => {
    const sentry = startSentry();

    console.error(`sync failed for CUIT ${FICTIONAL_CUIT}`);

    const logs = await sentItems(sentry, "log");
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0]?.payload)).toContain("sync failed for CUIT [redacted]");
    expect(JSON.stringify(logs[0]?.payload)).not.toContain(FICTIONAL_CUIT);
  });

  it("sends an event without its user, request or personal data", async () => {
    const sentry = startSentry();

    sentry.client.captureEvent({
      message: `rejected for CUIT ${FICTIONAL_CUIT}`,
      user: { id: "user-1", ip_address: "203.0.113.7" },
      request: { url: "https://cloud.example.test/sync?token=abc" },
    });

    const [event] = await sentItems(sentry, "event");
    expect(event?.payload).toMatchObject({ message: "rejected for CUIT [redacted]" });
    expect(event?.payload).not.toHaveProperty("user");
    expect(event?.payload).not.toHaveProperty("request");
  });

  it("redacts a breadcrumb's personal data before it travels with an event", async () => {
    const sentry = startSentry();

    addBreadcrumb({ message: `looked up CUIT ${FICTIONAL_CUIT}` });
    sentry.client.captureEvent({ message: "failed" });

    const [event] = await sentItems(sentry, "event");
    expect(JSON.stringify(event?.payload)).toContain("looked up CUIT [redacted]");
    expect(JSON.stringify(event?.payload)).not.toContain(FICTIONAL_CUIT);
  });
});

import { ERROR_REPORT_DATA_COLLECTION } from "@purosur/contracts";
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
import { errorReportingOptions } from "./error-reporting-options";

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
    ...errorReportingOptions(consoleLoggingIntegration),
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
  it("ships a console error line as a Sentry log with its personal data redacted", async () => {
    const sentry = startSentry();

    console.error(`sync failed for CUIT ${FICTIONAL_CUIT}`);

    const logs = await sentItems(sentry, "log");
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0]?.payload)).toContain("sync failed for CUIT [redacted]");
    expect(JSON.stringify(logs[0]?.payload)).not.toContain(FICTIONAL_CUIT);
  });

  it("ships console info and warn lines but not debug lines", async () => {
    const sentry = startSentry();

    console.info("info line");
    console.warn("warn line");
    console.debug("debug line");

    const logs = await sentItems(sentry, "log");
    const text = JSON.stringify(logs.map((log) => log.payload));
    expect(text).toContain("info line");
    expect(text).toContain("warn line");
    expect(text).not.toContain("debug line");
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

  it("turns every data collection category off", () => {
    const options = errorReportingOptions(consoleLoggingIntegration);

    expect(options.dataCollection).toBe(ERROR_REPORT_DATA_COLLECTION);
  });
});

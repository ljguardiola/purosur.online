import {
  Client,
  type ClientOptions,
  type Envelope,
  type Event,
  setCurrentClient,
} from "@sentry/core";

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

export interface RecordingSentry {
  client: Client;
  envelopes: Envelope[];
  items: () => { type: string; payload: Record<string, unknown> }[];
}

export function startRecordingSentry(options: Partial<ClientOptions>): RecordingSentry {
  const envelopes: Envelope[] = [];
  const client = new RecordingClient({
    dsn: "https://public@errors.example.test/1",
    integrations: [],
    stackParser: () => [],
    transport: () => ({
      send: (envelope) => {
        envelopes.push(envelope);
        return Promise.resolve({});
      },
      flush: () => Promise.resolve(true),
    }),
    ...options,
  });
  setCurrentClient(client);
  client.init();

  return {
    client,
    envelopes,
    items: () =>
      envelopes.flatMap(([, envelopeItems]) =>
        envelopeItems.map(([header, payload]) => ({
          type: String(header.type),
          payload: payload as Record<string, unknown>,
        })),
      ),
  };
}

import * as Sentry from "@sentry/node";
import { initSentry } from "../sentry.js";

export interface SentEnvelopes {
  events: string[];
  everything: string;
}

export function startRecordingSentry(): () => Promise<SentEnvelopes> {
  const events: string[] = [];
  const sent: string[] = [];
  initSentry(
    { dsn: "https://public@errors.example.test/1" },
    {
      init: (options) =>
        Sentry.init({
          ...options,
          transport: () => ({
            send: (envelope) => {
              const serialized = JSON.stringify(envelope);
              sent.push(serialized);
              if (envelope[1].some(([header]) => header.type === "event")) {
                events.push(serialized);
              }
              return Promise.resolve({});
            },
            flush: () => Promise.resolve(true),
          }),
        }),
    },
  );
  return async () => {
    await Sentry.flush();
    return { events, everything: sent.join("\n") };
  };
}

import * as Sentry from "@sentry/node";
import { initSentry } from "../sentry.js";

export function startRecordingSentry(): () => Promise<string[]> {
  const sent: string[] = [];
  initSentry(
    { dsn: "https://public@errors.example.test/1" },
    {
      init: (options) =>
        Sentry.init({
          ...options,
          transport: () => ({
            send: (envelope) => {
              sent.push(JSON.stringify(envelope));
              return Promise.resolve({});
            },
            flush: () => Promise.resolve(true),
          }),
        }),
    },
  );
  return async () => {
    await Sentry.flush();
    return sent;
  };
}

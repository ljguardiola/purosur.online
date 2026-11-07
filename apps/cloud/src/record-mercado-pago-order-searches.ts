import { randomUUID } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  orderSearchRecordingFailure,
  orderSearchRecordingSettingsOf,
  recordMercadoPagoOrderSearches,
} from "./payments/mercado-pago-order-search-recording.js";

if (import.meta.main) {
  const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
  const result = orderSearchRecordingSettingsOf(process.argv.slice(2), process.env, repositoryRoot);
  if (result.kind === "refused") {
    console.error(`record-mercado-pago-order-searches: ${result.reason}`);
    process.exit(1);
  } else {
    recordMercadoPagoOrderSearches({
      ...result.settings,
      fetch: globalThis.fetch,
      now: () => new Date(),
      newId: randomUUID,
      wait: (ms) => wait(ms),
      log: console.log,
    })
      .then((report) => {
        for (const { file, replacements } of report.scrubbed) {
          const replaced = replacements.map(({ field, count }) => `${field} x${count}`);
          console.log(
            `record-mercado-pago-order-searches: ${file}: ${replaced.join(", ") || "nothing replaced"}`,
          );
        }
        const failure = orderSearchRecordingFailure(report);
        if (failure !== undefined) {
          console.error(`record-mercado-pago-order-searches: ${failure}`);
          process.exit(1);
        }
      })
      .catch((error: unknown) => {
        console.error(
          `record-mercado-pago-order-searches: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      });
  }
}

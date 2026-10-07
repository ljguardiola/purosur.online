import { recordArcaResponses, recordingSettingsOf } from "./fiscal/arca-response-recording.js";
import { wsaaEndpointOf } from "./fiscal/wsaa-authentication.js";
import { wsfeEndpointOf } from "./fiscal/wsfe-arca-vitality-service.js";

if (import.meta.main) {
  const result = recordingSettingsOf(process.argv.slice(2), process.env);
  if (result.kind === "refused") {
    console.error(`record-arca-responses: ${result.reason}`);
    process.exit(1);
  } else {
    recordArcaResponses({
      ...result.settings,
      wsaaEndpoint: wsaaEndpointOf("homologation"),
      wsfeEndpoint: wsfeEndpointOf("homologation"),
      now: () => new Date(),
    })
      .then((report) => {
        for (const { file, replacements } of report.scrubbed) {
          const replaced = replacements.map(({ field, count }) => `${field} x${count}`);
          console.log(
            `record-arca-responses: ${file}: ${replaced.join(", ") || "nothing replaced"}`,
          );
        }
        if (!report.firstLoginIssuedTicket) {
          console.error(
            "record-arca-responses: the first login did not issue a ticket (ARCA may still hold a valid one for this certificate); login-cms-issued is not a ticket answer",
          );
          process.exit(1);
        }
      })
      .catch((error: unknown) => {
        console.error(
          `record-arca-responses: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      });
  }
}

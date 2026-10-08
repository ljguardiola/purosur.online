import {
  arcaTestEnvironmentCheckSettingsOf,
  checkArcaTestEnvironment,
  describeArcaTestEnvironmentCheck,
} from "./fiscal/arca-test-environment-check.js";
import { wsaaEndpointOf } from "./fiscal/wsaa-authentication.js";
import { wsfeEndpointOf } from "./fiscal/wsfe-arca-vitality-service.js";

if (import.meta.main) {
  const result = arcaTestEnvironmentCheckSettingsOf(process.argv.slice(2), process.env);
  if (result.kind === "refused") {
    console.error(`check-arca-test-environment: ${result.reason}`);
    process.exit(1);
  } else {
    Promise.resolve()
      .then(() =>
        checkArcaTestEnvironment({
          ...result.settings,
          wsaaEndpoint: wsaaEndpointOf("homologation"),
          wsfeEndpoint: wsfeEndpointOf("homologation"),
          now: () => new Date(),
        }),
      )
      .then((report) => {
        for (const line of describeArcaTestEnvironmentCheck(report)) {
          console.log(line);
        }
        if (!report.passed) {
          process.exit(1);
        }
      })
      .catch((error: unknown) => {
        console.error(
          `check-arca-test-environment: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      });
  }
}

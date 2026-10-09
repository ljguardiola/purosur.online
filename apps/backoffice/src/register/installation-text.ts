import { registerSummarySchema } from "@purosur/contracts";
import { formatDate } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";
import type { RegisterInstallation } from "./registers-api";

const INSTALLATION_TIME_ZONE = schemaText(
  registerSummarySchema.shape.installation.unwrap().options[0].shape.enrolled_at.meta()?.[
    "timeZone"
  ],
);

function installationDate(instant: string): string {
  return formatDate(new Date(instant), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: INSTALLATION_TIME_ZONE,
  });
}

export function installationLines(
  installation: RegisterInstallation | null,
): { primary: string; secondary: string } | null {
  if (installation === null) {
    return null;
  }
  if (installation.state === "enrolled") {
    return {
      primary: `Dada de alta el ${installationDate(installation.enrolledAt)}`,
      secondary: installation.windowsVersion,
    };
  }
  return {
    primary: `Revocada el ${installationDate(installation.revokedAt)}`,
    secondary: `${installation.hostname} · ${installation.windowsVersion}`,
  };
}

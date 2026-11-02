import { fortnightPresentationSchema } from "@purosur/contracts";
import { formatDayAndTime } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

const REVOKED_INSTALLATION_TIME_ZONE = schemaText(
  fortnightPresentationSchema.shape.revoked_installations.element.shape.revoked_at.meta()?.[
    "timeZone"
  ],
);

export function revokedInstallationDayAndTime(instant: string): string {
  return formatDayAndTime(instant, REVOKED_INSTALLATION_TIME_ZONE);
}

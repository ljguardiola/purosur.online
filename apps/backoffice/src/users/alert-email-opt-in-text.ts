import { branchUserSchema } from "@purosur/contracts";
import { formatDate } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

const OPT_IN_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: schemaText(branchUserSchema.shape.alert_email_opted_in_at.meta()?.["timeZone"]),
};

export function alertEmailOptInText(optedInAt: string | null): string {
  return optedInAt === null
    ? "No recibe alertas por email"
    : `Recibe alertas por email desde ${formatDate(new Date(optedInAt), OPT_IN_DATE_OPTIONS)}`;
}

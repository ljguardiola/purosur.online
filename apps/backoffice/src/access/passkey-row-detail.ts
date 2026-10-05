import { passkeySummarySchema } from "@purosur/contracts";
import { formatDate } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

const PASSKEY_TIME_ZONE = schemaText(passkeySummarySchema.shape.created_at.meta()?.["timeZone"]);

const PASSKEY_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: PASSKEY_TIME_ZONE,
};
const PASSKEY_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: PASSKEY_TIME_ZONE,
};

export function passkeyRowDetail(
  passkey: { createdAt: string; lastUsedAt: string | null },
  now: Date,
): string {
  const registered = `Registrada el ${formatDate(new Date(passkey.createdAt), PASSKEY_DATE_OPTIONS)}`;
  if (!passkey.lastUsedAt) {
    return registered;
  }
  const lastUsedAt = new Date(passkey.lastUsedAt);
  const time = formatDate(lastUsedAt, PASSKEY_TIME_OPTIONS);
  const lastUsedDate = formatDate(lastUsedAt, PASSKEY_DATE_OPTIONS);
  const sameDay = lastUsedDate === formatDate(now, PASSKEY_DATE_OPTIONS);
  const lastUsed = sameDay ? `último uso hoy ${time}` : `último uso el ${lastUsedDate} ${time}`;
  return `${registered} · ${lastUsed}`;
}

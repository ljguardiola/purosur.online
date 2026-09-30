import { ARGENTINA_TIME_ZONE } from "@purosur/contracts";
import { formatDate } from "@purosur/ui";

function statusText(openedAt: string | undefined): string {
  if (openedAt === undefined) {
    return "Sin sesión abierta";
  }
  const time = formatDate(new Date(openedAt), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: ARGENTINA_TIME_ZONE,
  });
  return `Sesión abierta ${time}`;
}

export function SessionEyebrow({
  registerName,
  openedAt,
}: {
  registerName: string | null;
  openedAt?: string;
}) {
  const status = statusText(openedAt);
  return (
    <p className="text-caption font-bold text-text-eyebrow uppercase tracking-sm">
      {registerName === null ? status : `${registerName} · ${status}`}
    </p>
  );
}

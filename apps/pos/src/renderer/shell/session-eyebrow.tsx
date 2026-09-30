import { formatClockTime } from "../platform/clock-time";
import { Eyebrow } from "./eyebrow";

function statusText(openedAt: string | undefined): string {
  if (openedAt === undefined) {
    return "Sin sesión abierta";
  }
  return `Sesión abierta ${formatClockTime(openedAt)}`;
}

export function SessionEyebrow({
  registerName,
  openedAt,
}: {
  registerName: string | null;
  openedAt?: string;
}) {
  const status = statusText(openedAt);
  return <Eyebrow text={registerName === null ? status : `${registerName} · ${status}`} />;
}

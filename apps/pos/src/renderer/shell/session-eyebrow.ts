import { formatClockTime } from "@purosur/ui";

function statusText(openedAt: string | undefined): string {
  if (openedAt === undefined) {
    return "Sin sesión abierta";
  }
  return `Sesión abierta ${formatClockTime(openedAt)}`;
}

export function sessionEyebrow(registerName: string | null, openedAt?: string): string {
  const status = statusText(openedAt);
  return registerName === null ? status : `${registerName} · ${status}`;
}

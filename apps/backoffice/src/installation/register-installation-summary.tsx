import { Tag } from "@purosur/ui";
import { useEffect, useState } from "react";
import { installationLines } from "./installation-text";
import {
  pendingCodeAfter,
  pendingCodeExpiryText,
  pendingCodeIssuedText,
} from "./pending-code-text";
import type { RegisterInstallation, RegisterSummary } from "./registers-api";

const COUNTDOWN_TICK_SECONDS = 30;

export function useSecondsSinceRead(registers: RegisterSummary[]): number {
  const [countdown, setCountdown] = useState({ read: registers, ticks: 0 });
  const ticksSinceRead = countdown.read === registers ? countdown.ticks : 0;

  useEffect(() => {
    const intervalId = window.setInterval(
      () =>
        setCountdown((counted) => ({
          read: registers,
          ticks: counted.read === registers ? counted.ticks + 1 : 1,
        })),
      COUNTDOWN_TICK_SECONDS * 1000,
    );
    return () => window.clearInterval(intervalId);
  }, [registers]);

  return ticksSinceRead * COUNTDOWN_TICK_SECONDS;
}

export function InstallationStatusTag({
  installation,
}: {
  installation: RegisterInstallation | null;
}) {
  if (installation === null) {
    return <Tag tone="info">Esperando alta</Tag>;
  }
  return installation.state === "enrolled" ? (
    <Tag tone="success">Activa</Tag>
  ) : (
    <Tag tone="neutral">Revocada</Tag>
  );
}

export function RegisterInstallationSummary({
  register,
  secondsSinceRead,
}: {
  register: RegisterSummary;
  secondsSinceRead: number;
}) {
  const pendingCode =
    register.pendingCode === null ? null : pendingCodeAfter(register.pendingCode, secondsSinceRead);
  const lines = installationLines(register.installation);
  if (lines === null && pendingCode === null) {
    return <span className="text-text-subtle text-detail">—</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {lines !== null && (
        <>
          <span className="text-text text-detail">{lines.primary}</span>
          <span className="text-text-subtle text-detail">{lines.secondary}</span>
        </>
      )}
      {pendingCode !== null && (
        <>
          <span className="text-text text-detail">
            {pendingCodeIssuedText(pendingCode.secondsSinceIssued)}
          </span>
          <span className="text-detail text-warning-strong">
            {pendingCodeExpiryText(pendingCode.secondsUntilExpiry)}
          </span>
        </>
      )}
    </div>
  );
}

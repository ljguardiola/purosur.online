import type { RegisterStatus } from "@purosur/contracts";
import { LoadFailure, LoadingPlaceholder, plural, StatusPill, StatusPillButton } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment } from "react";
import { FiscalModeIndicator } from "../fiscal/fiscal-mode-indicator";
import type { SerialDeviceRole } from "../register/serial-device-standing";
import { serialDeviceStandingIndicator } from "../register/serial-device-standing";
import { cloudStanding } from "./cloud-standing";
import { registerEyebrow } from "./register-eyebrow";
import type { RegisterNoticeSummary } from "./register-notices";
import { registerNoticeSummary } from "./register-notices";
import type { RegisterStatusData } from "./register-status-context";

function NoticesPill({ summary }: { summary: RegisterNoticeSummary }) {
  const navigate = useNavigate();
  const { count, tone } = summary;
  return (
    <StatusPillButton
      tone={tone}
      onPress={() => void navigate({ to: "/settings", search: { section: "register" } })}
    >
      {`${count} ${plural(count, { one: "aviso", other: "avisos" })}`}
    </StatusPillButton>
  );
}

const SERIAL_DEVICE_ROLES = ["scale", "reader"] as const;

const PROBLEM_STANDINGS: readonly RegisterStatus["serial_devices"][SerialDeviceRole][] = [
  "not_detected",
  "mismatched",
];

function Crumbs({
  person,
  registerName,
  cashSession,
  crumb,
}: Pick<RegisterStatusData, "person" | "registerName" | "cashSession"> & {
  crumb: string | undefined;
}) {
  const crumbs = [
    registerEyebrow(registerName),
    ...(person === undefined ? [] : [person.first_name]),
    ...(crumb !== undefined
      ? [crumb]
      : cashSession.status === "none"
        ? ["Sin sesión abierta"]
        : []),
  ];
  return (
    <p className="flex items-center gap-2 text-detail text-text">
      {crumbs.map((crumb, position) => (
        <Fragment key={crumb}>
          {position === 0 ? (
            <span className="font-bold text-caption text-text-eyebrow uppercase tracking-sm">
              {crumb}
            </span>
          ) : (
            <>
              <span aria-hidden="true" className="text-border">
                •
              </span>
              <span>{crumb}</span>
            </>
          )}
        </Fragment>
      ))}
    </p>
  );
}

export type RegisterHeaderProps = RegisterStatusData & {
  crumb?: string | undefined;
  mode?: ReactNode;
};

export function RegisterHeader({
  person,
  registerName,
  cashSession,
  status,
  backupTickets,
  crumb,
  mode,
}: RegisterHeaderProps) {
  const noticeSummary = registerNoticeSummary({
    conditions: status.status === "loaded" ? status.value.conditions : [],
    contingency: status.status === "loaded" ? status.value.contingency : null,
    backupTickets: backupTickets.status === "loaded" ? backupTickets.value : undefined,
  });
  return (
    <section aria-label="Estado de la caja" className="flex shrink-0 flex-col gap-3 px-8 pt-6 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <Crumbs
          person={person}
          registerName={registerName}
          cashSession={cashSession}
          crumb={crumb}
        />
        <div className="flex flex-wrap items-center gap-2">
          {status.status === "loaded" && status.value.cloud === "unreachable" ? (
            <StatusPill tone="error">{cloudStanding("unreachable").text}</StatusPill>
          ) : null}
          {status.status === "loaded" ? (
            <FiscalModeIndicator contingency={status.value.contingency} />
          ) : null}
          {status.status === "loaded"
            ? SERIAL_DEVICE_ROLES.map((device) =>
                PROBLEM_STANDINGS.includes(status.value.serial_devices[device]) ? (
                  <StatusPill key={device} tone="warning">
                    {
                      serialDeviceStandingIndicator(device, status.value.serial_devices[device])
                        .text
                    }
                  </StatusPill>
                ) : null,
              )
            : null}
          {noticeSummary.count > 0 ? <NoticesPill summary={noticeSummary} /> : null}
          {mode}
        </div>
      </div>
      {status.status === "loading" ? <LoadingPlaceholder variant="card" lines={1} /> : null}
      {status.status === "failed" ? (
        <LoadFailure
          icon={<TriangleAlert />}
          title="No se pudo leer el estado de la caja"
          onRetry={status.retry}
        />
      ) : null}
    </section>
  );
}

import type { ContingencyBackupTicketsAnswer, RegisterStatus } from "@purosur/contracts";
import type { Icon } from "@purosur/ui";
import {
  formatDayAndTime,
  LoadFailure,
  LoadingPlaceholder,
  localAlertText,
  NotificationCard,
  NotificationPanel,
  plural,
  StatusPill,
  StatusPillButton,
} from "@purosur/ui";
import {
  Ban,
  BatteryLow,
  BatteryWarning,
  Clock,
  CloudOff,
  Database,
  HardDrive,
  Power,
  Receipt,
  ScanBarcode,
  ShieldOff,
  TriangleAlert,
  Unplug,
} from "lucide-react";
import { Fragment } from "react";
import { ContingencyBackupTicketsNoticeCard } from "../backups/contingency-backup-tickets-notice-card";
import { contingencyBackupTicketsNoticeCount } from "../backups/contingency-backup-tickets-notice-count";
import { ContingencyNoticeCard } from "../fiscal/contingency-notice-card";
import { FiscalModeIndicator } from "../fiscal/fiscal-mode-indicator";
import type { SerialDeviceRole } from "../register/serial-device-standing";
import { serialDeviceStandingIndicator } from "../register/serial-device-standing";
import { registerEyebrow } from "./register-eyebrow";
import type { RegisterStatusData } from "./register-status-context";

type Condition = RegisterStatus["conditions"][number];

const CONDITION_ICONS: Record<Condition["kind"], Icon> = {
  sales_denied: <Ban />,
  installation_revoked: <ShieldOff />,
  fiscal_emission_stopped: <Receipt />,
  clock_drift: <Clock />,
  register_silent: <CloudOff />,
  serial_device_missing: <ScanBarcode />,
  disk_space_low: <HardDrive />,
  wal_oversized: <Database />,
  battery_low: <BatteryLow />,
  on_battery: <Unplug />,
  battery_missing: <BatteryWarning />,
  critical_battery_action_not_shutdown: <Power />,
};

function conditionTone(condition: Condition): "error" | "warning" {
  return condition.level === "critical" ? "error" : "warning";
}

function NoticesPill({
  conditions,
  contingency,
  backupTickets,
  onDiscardBackupTickets,
}: {
  conditions: RegisterStatus["conditions"];
  contingency: RegisterStatus["contingency"];
  backupTickets: ContingencyBackupTicketsAnswer | undefined;
  onDiscardBackupTickets: () => void;
}) {
  const tone =
    conditions.some((condition) => conditionTone(condition) === "error") ||
    (backupTickets?.missing_key ?? 0) > 0
      ? "error"
      : "warning";
  const count =
    conditions.length +
    (contingency?.notice ? 1 : 0) +
    (backupTickets === undefined ? 0 : contingencyBackupTicketsNoticeCount(backupTickets));
  return (
    <NotificationPanel
      title="Avisos de esta caja"
      trigger={
        <StatusPillButton tone={tone}>
          {`${count} ${plural(count, { one: "aviso", other: "avisos" })}`}
        </StatusPillButton>
      }
    >
      {conditions.map((condition) => {
        const text = localAlertText(condition);
        return (
          <NotificationCard
            key={condition.kind}
            tone={conditionTone(condition)}
            icon={CONDITION_ICONS[condition.kind]}
            title={text.title}
            description={text.meaning}
            whatToDo={text.whatToDo}
            time={`Desde ${formatDayAndTime(condition.since)}`}
          />
        );
      })}
      {contingency?.notice ? <ContingencyNoticeCard kind={contingency.kind} /> : null}
      {backupTickets === undefined ? null : (
        <ContingencyBackupTicketsNoticeCard
          tickets={backupTickets}
          onDiscard={onDiscardBackupTickets}
        />
      )}
    </NotificationPanel>
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
}: Pick<RegisterStatusData, "person" | "registerName" | "cashSession">) {
  const crumbs = [
    registerEyebrow(registerName),
    ...(person === undefined ? [] : [person.first_name]),
    ...(cashSession.status === "none" ? ["Sin sesión abierta"] : []),
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
              <span className="font-medium">{crumb}</span>
            </>
          )}
        </Fragment>
      ))}
    </p>
  );
}

export function RegisterHeader({
  person,
  registerName,
  cashSession,
  status,
  backupTickets,
  onDiscardBackupTickets,
}: RegisterStatusData) {
  const loadedBackupTickets = backupTickets.status === "loaded" ? backupTickets.value : undefined;
  const noticeCount =
    (status.status === "loaded"
      ? status.value.conditions.length + (status.value.contingency?.notice ? 1 : 0)
      : 0) +
    (loadedBackupTickets === undefined
      ? 0
      : contingencyBackupTicketsNoticeCount(loadedBackupTickets));
  return (
    <section aria-label="Estado de la caja" className="flex shrink-0 flex-col gap-3 px-8 pt-6 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <Crumbs person={person} registerName={registerName} cashSession={cashSession} />
        <div className="flex flex-wrap items-center gap-2">
          {status.status === "loaded" && status.value.cloud === "unreachable" ? (
            <StatusPill tone="error">Sin conexión con la nube</StatusPill>
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
          {noticeCount > 0 ? (
            <NoticesPill
              conditions={status.status === "loaded" ? status.value.conditions : []}
              contingency={status.status === "loaded" ? status.value.contingency : null}
              backupTickets={loadedBackupTickets}
              onDiscardBackupTickets={onDiscardBackupTickets}
            />
          ) : null}
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

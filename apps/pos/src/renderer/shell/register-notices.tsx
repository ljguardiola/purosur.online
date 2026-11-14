import type { ContingencyBackupTicketsAnswer, RegisterStatus } from "@purosur/contracts";
import type { Icon, NoticeTileProps } from "@purosur/ui";
import { formatDayMonthAndTime, localAlertText } from "@purosur/ui";
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
  Unplug,
} from "lucide-react";
import { contingencyBackupTicketsNoticeCount } from "../backups/contingency-backup-tickets-notice-count";
import { contingencyBackupTicketsNotices } from "../backups/contingency-backup-tickets-notices";
import { contingencyNoticeText } from "../fiscal/contingency-notice-text";

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

export type RegisterNoticesInput = {
  conditions: RegisterStatus["conditions"];
  contingency: RegisterStatus["contingency"];
  backupTickets: ContingencyBackupTicketsAnswer | undefined;
};

export type RegisterNotice = Omit<NoticeTileProps, "focused"> & {
  id: string;
  discardable: boolean;
};

export type RegisterNoticeSummary = { count: number; tone: "error" | "warning" };

function isCritical(condition: Condition): boolean {
  return condition.level === "critical";
}

export function registerNoticeSummary({
  conditions,
  contingency,
  backupTickets,
}: RegisterNoticesInput): RegisterNoticeSummary {
  const lacksBackupKey = (backupTickets?.missing_key ?? 0) > 0;
  return {
    count:
      conditions.length +
      (contingency?.notice ? 1 : 0) +
      (backupTickets === undefined ? 0 : contingencyBackupTicketsNoticeCount(backupTickets)),
    tone: conditions.some(isCritical) || lacksBackupKey ? "error" : "warning",
  };
}

function conditionNotice(condition: Condition): RegisterNotice {
  const text = localAlertText(condition);
  return {
    id: condition.kind,
    tone: isCritical(condition) ? "error" : "warning",
    icon: CONDITION_ICONS[condition.kind],
    title: text.title,
    subtitle: `Desde ${formatDayMonthAndTime(condition.since)}`,
    description: text.meaning,
    whatToDo: text.whatToDo,
    discardable: false,
  };
}

export function registerNotices({
  conditions,
  contingency,
  backupTickets,
}: RegisterNoticesInput): RegisterNotice[] {
  const text = contingency?.notice ? contingencyNoticeText(contingency.kind) : undefined;
  return [
    ...conditions.filter(isCritical).map(conditionNotice),
    ...(text === undefined
      ? []
      : [
          {
            id: "contingency",
            tone: "warning" as const,
            icon: <Receipt />,
            title: text.title,
            description: text.description,
            whatToDo: text.whatToDo,
            discardable: false,
          },
        ]),
    ...(backupTickets === undefined ? [] : contingencyBackupTicketsNotices(backupTickets)),
    ...conditions.filter((condition) => !isCritical(condition)).map(conditionNotice),
  ];
}

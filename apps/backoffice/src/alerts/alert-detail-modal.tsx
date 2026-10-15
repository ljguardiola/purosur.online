import {
  type AlertDetail,
  alertDetailSchema,
  type PermissionCatalogWire,
} from "@purosur/contracts";
import type { AlertLevel } from "@purosur/domain";
import {
  Button,
  ButtonLink,
  EmptyState,
  formatCalendarDay,
  formatCalendarDayRange,
  formatDate,
  formatDayAndTime,
  formatInvoiceNumber,
  formatNumber,
  formatPercent,
  formatPointOfSaleNumber,
  InlineNotice,
  isLocalAlertKind,
  LoadFailure,
  LoadingPlaceholder,
  LocalAlertExplanation,
  localAlertTitle,
  Modal,
  plural,
  StatusIndicator,
} from "@purosur/ui";
import { createLink } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  CalendarClock,
  Check,
  Clock,
  CloudDownload,
  CloudOff,
  DatabaseBackup,
  KeyRound,
  Laptop,
  LifeBuoy,
  Mail,
  PackageX,
  ShieldAlert,
  ShieldPlus,
  ShieldX,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { type ReactElement, useState } from "react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { fetchPermissionCatalog as fetchPermissionCatalogDefault } from "../platform/permission-catalog-api";
import { AREA_LABELS, PERMISSION_LABELS } from "../platform/permission-labels";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { roleDisplayName } from "../platform/role-display-name";
import { schemaText } from "../platform/schema-text";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import {
  type BackofficeAccess,
  canCloseAlertsManually,
  canSeeExpiringLots,
  canSeeQuarantinedEvents,
} from "../shell/backoffice-access";
import { alertKindDescription } from "./alert-kind-description";
import { alertKindLabel } from "./alert-kind-label";
import { ALERT_LEVEL_TONE } from "./alert-level-tone";
import { alertScopeLabel } from "./alert-scope-label";
import { closeAlert as closeAlertDefault, fetchAlert as fetchAlertDefault } from "./alerts-api";
import {
  useAlertQuery,
  usePermissionCatalogQuery,
  useRefreshAlerts,
  useRefreshAlertsAfterClosing,
} from "./alerts-queries";
import { preEmissionCheckReasonLabel } from "./pre-emission-check-reason-label";
import {
  invariantViolationDescription,
  quarantinedEventsDescription,
} from "./synced-event-alert-description";

type Icon = ReactElement<{ className?: string }>;

const ScreenLink = createLink(ButtonLink);

const ALERT_TIME_ZONE = schemaText(
  alertDetailSchema.options[0].shape.openedAt.meta()?.["timeZone"],
);

const ALERT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: ALERT_TIME_ZONE,
};
const ALERT_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: ALERT_TIME_ZONE,
};

export function alertDateTime(date: Date): string {
  return `${formatDate(date, ALERT_DATE_OPTIONS)} ${formatDate(date, ALERT_TIME_OPTIONS)}`;
}

export const ALERT_LEVEL_LABELS: Record<AlertLevel, string> = {
  critical: "Crítica",
  warning: "Advertencia",
  informational: "Informativa",
};

export type AlertDetailModalServices = {
  fetchAlert: typeof fetchAlertDefault;
  fetchPermissionCatalog: typeof fetchPermissionCatalogDefault;
  closeAlert: typeof closeAlertDefault;
};

const defaultAlertDetailModalServices: AlertDetailModalServices = {
  fetchAlert: fetchAlertDefault,
  fetchPermissionCatalog: fetchPermissionCatalogDefault,
  closeAlert: closeAlertDefault,
};

export type AlertDetailModalProps = {
  alertId: string | null;
  access: BackofficeAccess;
  onClose: () => void;
  onClosed: () => void;
  onSessionEnded: () => void;
  services?: AlertDetailModalServices;
};

type FormNotice =
  | { kind: "alreadyClosed" }
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

function levelLabel(level: AlertLevel): string {
  return ALERT_LEVEL_LABELS[level];
}

function alertIcon(kind: string): Icon {
  switch (kind) {
    case "backoffice_passkey_changed":
      return <KeyRound />;
    case "backoffice_recovery_requested":
      return <LifeBuoy />;
    case "user_email_changed":
      return <Mail />;
    case "backoffice_sign_in_lockout":
      return <ShieldAlert />;
    case "user_access_increased":
      return <ShieldPlus />;
    case "register_enrolled":
      return <Laptop />;
    case "events_quarantined":
      return <PackageX />;
    case "event_invariant_violated":
      return <TriangleAlert />;
    case "outbox_chain_broken":
      return <ShieldAlert />;
    case "update_required":
      return <CloudOff />;
    case "register_silent":
      return <WifiOff />;
    case "offline_authorization_code_missing":
      return <CloudDownload />;
    case "lots_expiring":
    case "fortnight_report_pending":
      return <CalendarClock />;
    case "offsite_dump_unverified":
      return <DatabaseBackup />;
    case "fortnight_report_overdue":
    case "fortnight_report_needs_regularization":
      return <TriangleAlert />;
    case "clock_corrected":
      return <Clock />;
    default:
      return <Bell />;
  }
}

// Many permission labels only read clearly under their area's heading, as the role editor shows them.
function permissionLabels(
  catalog: PermissionCatalogWire,
  keys: readonly string[],
): string[] | undefined {
  const labelsWithArea = new Map<string, string>(
    catalog.flatMap(({ area, permissions }) =>
      permissions.map(({ key }) => [key, `${AREA_LABELS[area]}: ${PERMISSION_LABELS[key]}`]),
    ),
  );
  if (keys.length === 0 || !keys.every((key) => labelsWithArea.has(key))) {
    return undefined;
  }
  return keys.map((key) => `«${labelsWithArea.get(key)}»`);
}

const PERMISSION_LIST_FORMAT = new Intl.ListFormat("es-AR", { type: "conjunction" });

type AccessIncreasedAlert = Extract<AlertDetail, { kind: "user_access_increased" }>;

function accessIncreaseDescription(
  detail: AccessIncreasedAlert["detail"],
  targetName: string,
  catalog: PermissionCatalogWire,
) {
  const { actorName } = detail;
  if (actorName === undefined) {
    return "";
  }
  switch (detail.cause) {
    case "created_as_administrator":
      return `El Administrador ${actorName} creó a ${targetName} como Administrador.`;
    case "role_assigned":
      return `El Administrador ${actorName} cambió el rol de ${targetName} de «${roleDisplayName(detail.previousRole)}» a «${roleDisplayName(detail.newRole)}», que le da permisos que no tenía.`;
    case "role_permissions_added": {
      const labels = permissionLabels(catalog, detail.addedPermissionKeys);
      if (labels === undefined) {
        return "";
      }
      const permissionList = PERMISSION_LIST_FORMAT.format(labels);
      const permissionsText = plural(labels.length, {
        one: `el permiso ${permissionList}`,
        other: `los permisos ${permissionList}`,
      });
      return `El Administrador ${actorName} agregó ${permissionsText} al rol «${detail.roleName}», que tiene ${targetName}.`;
    }
  }
}

function registerEnrollmentDescription(
  {
    hostname,
    windowsVersion,
    replacedInstallation,
  }: { hostname: string; windowsVersion: string; replacedInstallation: boolean },
  registerName: string,
): string {
  const replaced = replacedInstallation ? " La instalación que tenía antes dejó de funcionar." : "";
  return `La caja «${registerName}» se dio de alta en el equipo «${hostname}» (${windowsVersion}).${replaced} Si no se reconoce esta alta, conviene revisarla desde Cajas registradoras.`;
}

function arcaCertificateExpiringDescription(
  notAfter: string,
  scopeKind: string,
  environment: string,
): string {
  const label = alertScopeLabel(scopeKind, environment).toLocaleLowerCase("es-AR");
  return `El certificado de ARCA de ${label} vence el ${alertDateTime(new Date(notAfter))}. Conviene cargar uno nuevo antes de esa fecha.`;
}

type OffsiteDumpUnverifiedDetail = Extract<
  AlertDetail,
  { kind: "offsite_dump_unverified" }
>["detail"];

const OFFSITE_DUMP_UNVERIFIED_REASON_TEXTS: Record<
  Exclude<OffsiteDumpUnverifiedDetail["reason"], "shrank">,
  string
> = {
  not_reported: "la verificación diaria no informó su resultado",
  object_missing: "el archivo de la copia no está en el almacenamiento externo",
  manifest_missing: "falta el manifiesto que acompaña a la copia",
  size_mismatch: "el tamaño del archivo no coincide con el del manifiesto",
  hash_mismatch: "la huella del archivo no coincide con la del manifiesto",
  decryption_failed: "no se pudo descifrar la copia",
  archive_unreadable: "la copia descifrada no se pudo leer",
};

function offsiteDumpUnverifiedReasonText(detail: OffsiteDumpUnverifiedDetail): string {
  return detail.reason === "shrank"
    ? `la copia pesa menos del ${formatPercent(detail.shrinkThresholdPercent)} de la anterior`
    : OFFSITE_DUMP_UNVERIFIED_REASON_TEXTS[detail.reason];
}

function offsiteDumpUnverifiedDescription(detail: OffsiteDumpUnverifiedDetail): string {
  return `La copia cifrada de la base de datos de la noche del ${formatCalendarDay(detail.night)} no se pudo verificar fuera de la nube: ${offsiteDumpUnverifiedReasonText(detail)}. Conviene revisar la copia cuanto antes.`;
}

function arcaWsaaTicketHeldDescription(retryIntervalMinutes: number): string {
  const interval = plural(retryIntervalMinutes, {
    one: "cada minuto",
    other: `cada ${formatNumber(retryIntervalMinutes)} minutos`,
  });
  return `La nube no tiene ticket de acceso a ARCA y ARCA no emite uno nuevo mientras siga vigente el anterior, que puede durar hasta 12 horas. La nube lo vuelve a pedir ${interval} y retoma la autorización en línea en cuanto lo obtiene. No hay que reemplazar el certificado ni cambiar la configuración. Mientras tanto la caja vende con el CAEA que ya tenga o en venta diferida.`;
}

function offlineAuthorizationCodeMissingDescription({
  level,
  detail,
}: Extract<AlertDetail, { kind: "offline_authorization_code_missing" }>): string {
  const fortnight = formatCalendarDayRange(detail.fortnightStart, detail.fortnightEnd);
  if (level === "informational") {
    return `El CAEA de la quincena ${fortnight} ya se puede pedir a ARCA. La caja lo baja sola al sincronizar.`;
  }
  if (level === "warning") {
    return `Falta que baje el CAEA de la quincena ${fortnight}. Conviene revisar que la caja esté encendida y con internet.`;
  }
  if (detail.fortnightStarted) {
    return `La quincena ${fortnight} ya empezó. Mientras ARCA no responda, las ventas de la caja quedan diferidas. Hay que conectarla a internet.`;
  }
  return `La quincena empieza el ${formatCalendarDay(detail.fortnightStart)}. Sin el CAEA, si ARCA no responde, la caja no puede emitir facturas y las ventas quedan diferidas. Hay que conectarla a internet hoy.`;
}

function lotsExpiringDescription({
  lotCount,
  windowDays,
}: Extract<AlertDetail, { kind: "lots_expiring" }>["detail"]): string {
  const lots = formatNumber(lotCount);
  const summary =
    windowDays === 0
      ? plural(lotCount, {
          one: `${lots} lote vencido o que vence hoy`,
          other: `${lots} lotes vencidos o que vencen hoy`,
        })
      : `${plural(lotCount, {
          one: `${lots} lote vencido o por vencer`,
          other: `${lots} lotes vencidos o por vencer`,
        })} en ${plural(windowDays, {
          one: "el próximo día",
          other: `${formatNumber(windowDays)} días`,
        })}`;
  return `${summary}.`;
}

function fortnightOfPointOfSale({
  pointOfSaleNumber,
  fortnightStart,
  fortnightEnd,
}: {
  pointOfSaleNumber: number;
  fortnightStart: string;
  fortnightEnd: string;
}): string {
  return `la quincena ${formatCalendarDayRange(fortnightStart, fortnightEnd)} del punto de venta ${formatPointOfSaleNumber(pointOfSaleNumber)}`;
}

function fortnightReportSubject(presentation: {
  pointOfSaleNumber: number;
  fortnightStart: string;
  fortnightEnd: string;
}): string {
  return `el informe de ${fortnightOfPointOfSale(presentation)}`;
}

function fortnightReportDeadlineText(deadline: string, daysLeft: number): string {
  if (daysLeft === 0) {
    return `Vence hoy, ${formatCalendarDay(deadline)}.`;
  }
  const left = plural(daysLeft, {
    one: "Queda 1 día.",
    other: `Quedan ${formatNumber(daysLeft)} días.`,
  });
  return `Vence el ${formatCalendarDay(deadline)}. ${left}`;
}

function fortnightReportWaitingText({
  reason,
  registerName,
}: Extract<AlertDetail, { kind: "fortnight_report_pending" }>["detail"]): string[] {
  switch (reason) {
    case "blocked":
      return [
        `Se puede presentar cuando la caja${registerName === undefined ? "" : ` «${registerName}»`} termine de sincronizar.`,
      ];
    case "missing_document":
      return [
        "Falta un comprobante en la numeración: hay que encontrarlo antes de poder seguir informando.",
      ];
    case "refused":
      return [
        "ARCA rechazó la presentación. La nube la vuelve a intentar sola; si sigue rechazándola, conviene revisar el punto de venta en ARCA.",
      ];
    case "pending":
      return [];
  }
}

function fortnightReportParagraphs(
  alert: Extract<
    AlertDetail,
    {
      kind:
        | "fortnight_report_pending"
        | "fortnight_report_overdue"
        | "fortnight_report_needs_regularization";
    }
  >,
): string[] {
  if (alert.kind === "fortnight_report_needs_regularization") {
    return [
      `Llegaron comprobantes emitidos sin conexión de ${fortnightOfPointOfSale(alert.detail)}, que ya se había informado a ARCA sin movimiento.`,
      "No hay corrección automática: hay que regularizar la presentación con ARCA a mano.",
    ];
  }
  if (alert.kind === "fortnight_report_overdue") {
    return [
      `Venció el ${formatCalendarDay(alert.detail.deadline)} el plazo para presentar a ARCA ${fortnightReportSubject(alert.detail)}.`,
      "Conviene regularizar la situación del punto de venta con ARCA.",
    ];
  }
  return [
    `Falta presentar a ARCA ${fortnightReportSubject(alert.detail)}.`,
    fortnightReportDeadlineText(alert.detail.deadline, alert.detail.daysLeft),
    ...fortnightReportWaitingText(alert.detail),
  ];
}

function fiscalUnknownDescription({
  pointOfSale,
  number,
  unclearSince,
}: Extract<AlertDetail, { kind: "fiscal_unknown" }>["detail"]): string {
  const document = `${formatPointOfSaleNumber(pointOfSale)}-${formatInvoiceNumber(number)}`;
  return `Comprobante ${document}, desde el ${alertDateTime(new Date(unclearSince))}. Mientras no se resuelva, ese punto de venta no pide CAE y las ventas de la caja quedan diferidas.`;
}

function externalBillingDescription({
  pointOfSale,
  number,
}: Extract<AlertDetail, { kind: "external_billing" }>["detail"]): string {
  const document = `${formatPointOfSaleNumber(pointOfSale)}-${formatInvoiceNumber(number)}`;
  return `ARCA tiene autorizado el comprobante ${document} de este punto de venta y ninguna venta de la caja lo justifica. Revisar quién lo emitió fuera del sistema. No se emite ninguna nota de crédito automática.`;
}

function alertTitle(alert: AlertDetail): string {
  const localTitle = alert.audience === "local" ? localAlertTitle(alert.kind) : undefined;
  if (localTitle !== undefined) {
    return localTitle;
  }
  switch (alert.kind) {
    case "backoffice_passkey_changed":
      return alert.detail.action === "removed"
        ? "Se dio de baja una passkey"
        : "Se registró una passkey";
    case "backoffice_recovery_requested":
      return "Se pidió el enlace de acceso";
    case "user_email_changed":
      return "Se cambió un correo";
    case "backoffice_sign_in_lockout":
      return "Se bloqueó un origen de ingreso";
    case "user_access_increased":
      return "Se amplió el acceso de un usuario";
    case "register_enrolled":
      return "Se dio de alta una caja";
    case "events_quarantined":
      return "Eventos de una caja en cuarentena";
    case "event_invariant_violated":
      return "Evento aplicado con una inconsistencia";
    case "arca_certificate_expiring":
      return "El certificado de ARCA está por vencer";
    case "arca_wsaa_ticket_held":
      return "ARCA conserva un ticket de acceso anterior";
    case "update_required":
      return "La nube no acepta la versión de una caja";
    case "register_silent":
    case "sales_denied":
    case "fiscal_rejected":
    case "offline_authorization_code_missing":
    case "fiscal_unknown":
    case "fiscal_emission_stopped":
    case "outbox_chain_broken":
      return alertKindDescription(alert.kind);
    case "late_payment_refund":
      return "Reembolso pendiente por un pago tardío";
    case "refund_task":
      return "Reembolso pendiente de confirmar";
    case "lots_expiring":
    case "offsite_dump_unverified":
    case "fortnight_report_pending":
    case "fortnight_report_overdue":
    case "external_billing":
    case "fortnight_report_needs_regularization":
    case "clock_corrected":
      return alertKindLabel(alert.kind);
  }
}

function alertDescription(alert: AlertDetail, catalog: PermissionCatalogWire = []): string {
  if (alert.kind === "backoffice_sign_in_lockout") {
    const { failureCount } = alert.detail;
    const failuresText = plural(failureCount, {
      one: "1 intento fallido",
      other: `${failureCount} intentos fallidos`,
    });
    return alert.scopeDisplay === null
      ? `Una dirección quedó bloqueada para ingresar al backoffice después de ${failuresText}.`
      : `La dirección ${alert.scopeDisplay} quedó bloqueada para ingresar al backoffice después de ${failuresText}.`;
  }
  if (alert.kind === "events_quarantined") {
    return quarantinedEventsDescription(alert.scopeDisplay);
  }
  if (alert.kind === "event_invariant_violated") {
    return invariantViolationDescription(alert.detail);
  }
  if (alert.kind === "lots_expiring") {
    return lotsExpiringDescription(alert.detail);
  }
  if (alert.kind === "offsite_dump_unverified") {
    return offsiteDumpUnverifiedDescription(alert.detail);
  }
  const targetName = alert.scopeDisplay;
  if (targetName === null) {
    return "";
  }
  switch (alert.kind) {
    case "backoffice_passkey_changed": {
      const { detail } = alert;
      if (detail.via === "self") {
        return detail.action === "registered"
          ? `${targetName} registró la passkey «${detail.passkeyName}». Si no se reconoce este cambio, conviene dar de baja esa passkey desde Usuarios.`
          : `${targetName} dio de baja la passkey «${detail.passkeyName}». Si no se reconoce este cambio, conviene revisar sus passkeys desde Usuarios.`;
      }
      if (detail.via === "recovery") {
        return `${targetName} registró la passkey «${detail.passkeyName}» al usar el enlace de recuperación de acceso. Si no se reconoce este cambio, conviene dar de baja esa passkey desde Usuarios.`;
      }
      return detail.actorName === undefined
        ? ""
        : `El Administrador ${detail.actorName} dio de baja la passkey «${detail.passkeyName}» de ${targetName}. Si no fue así, conviene revisarlo.`;
    }
    case "backoffice_recovery_requested":
      return `Alguien pidió el enlace de acceso para ${targetName}. Si no se reconoce este pedido, conviene revisar sus passkeys desde Usuarios.`;
    case "user_email_changed": {
      const { previousEmail, newEmail, actorName } = alert.detail;
      return actorName === undefined
        ? ""
        : `El Administrador ${actorName} cambió el correo de ${targetName} de ${previousEmail} a ${newEmail}.`;
    }
    case "user_access_increased":
      return accessIncreaseDescription(alert.detail, targetName, catalog);
    case "register_enrolled":
      return registerEnrollmentDescription(alert.detail, targetName);
    case "arca_certificate_expiring":
      return arcaCertificateExpiringDescription(alert.detail.notAfter, alert.scopeKind, targetName);
    case "arca_wsaa_ticket_held":
      return arcaWsaaTicketHeldDescription(alert.detail.retryIntervalMinutes);
    case "update_required":
      return `La caja «${targetName}» usa la versión ${alert.detail.appVersion}, que la nube ya no acepta. Hay que actualizarla para que vuelva a sincronizar.`;
    case "offline_authorization_code_missing":
      return offlineAuthorizationCodeMissingDescription(alert);
    case "fiscal_unknown":
      return fiscalUnknownDescription(alert.detail);
    case "external_billing":
      return externalBillingDescription(alert.detail);
    case "outbox_chain_broken":
      return `La caja «${targetName}» envió eventos que no coinciden con su cadena: alguno se alteró, se quitó o se reordenó en el disco de la caja. La nube rechazó el envío y dio de baja la instalación.`;
    case "fiscal_rejected":
      return "Cada venta de este punto de venta queda diferida hasta corregir la causa que indica ARCA.";
    case "register_silent":
    case "sales_denied":
    case "fiscal_emission_stopped":
    case "late_payment_refund":
    case "refund_task":
    case "fortnight_report_pending":
    case "fortnight_report_overdue":
    case "fortnight_report_needs_regularization":
      return "";
    case "clock_corrected":
      return alertKindDescription(alert.kind);
  }
}

function PermissionsAddedDescription({
  alert,
  fetchPermissionCatalog,
  onSessionEnded,
}: {
  alert: AlertDetail;
  fetchPermissionCatalog: typeof fetchPermissionCatalogDefault;
  onSessionEnded: () => void;
}) {
  const data = usePermissionCatalogQuery({ fetchPermissionCatalog, onSessionEnded });
  if (data.status === "loading") {
    return <LoadingPlaceholder variant="card" lines={2} />;
  }
  if (data.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(data, "los permisos")} />;
  }
  return <p className="text-text text-body">{alertDescription(alert, data.value)}</p>;
}

const REJECTION_CLASS_LABELS = {
  content: "Contenido del comprobante",
  standing: "Situación ante ARCA",
};

const CLOSING_NOTES: Record<AlertDetail["closing"], string | null> = {
  by_itself: null,
  with_its_refund: "Se cierra cuando su reembolso se marca como hecho o se descarta.",
  when_its_refund_is_done:
    "Se cierra cuando su reembolso se marca como hecho o Mercado Pago lo acredita.",
  when_its_document_is_resolved: "Se cierra sola cuando se resuelve el comprobante.",
  when_its_events_are_released:
    "Se resuelve sola cuando no queda ningún evento de esta caja en cuarentena.",
  by_hand: "No se cierra sola: se cierra a mano después de revisarla.",
};

function closingNote(alert: AlertDetail): string | null {
  return alert.kind === "external_billing" && alert.closing === "by_hand"
    ? "No se cierra sola: se cierra a mano después de revisar el comprobante."
    : CLOSING_NOTES[alert.closing];
}

function ClockCorrectionRows({
  detail,
}: {
  detail: Extract<AlertDetail, { kind: "clock_corrected" }>["detail"];
}) {
  const rows = [
    ["Punto de venta", formatPointOfSaleNumber(detail.pointOfSale)],
    ["Lectura anterior", formatDayAndTime(detail.previousReading, ALERT_TIME_ZONE)],
    ["Lectura nueva", formatDayAndTime(detail.correctedReading, ALERT_TIME_ZONE)],
    ...(detail.actorName === undefined ? [] : [["Corrigió", detail.actorName]]),
  ] as const;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3 text-detail">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-2">
          <span className="text-text-subtle">{label}</span>
          <span>{value}</span>
        </div>
      ))}
    </div>
  );
}

function AlertDescription({ alert }: { alert: AlertDetail }) {
  if (alert.kind === "fiscal_rejected") {
    return (
      <>
        <p className="text-text text-body">{alertDescription(alert)}</p>
        <p className="font-bold text-text text-detail">
          {REJECTION_CLASS_LABELS[alert.detail.rejectionClass]}
        </p>
        <ul className="flex flex-col gap-1 text-text text-detail">
          {alert.detail.rejections.map(({ code, message }) => (
            <li key={code}>{`${code}: ${message}`}</li>
          ))}
        </ul>
      </>
    );
  }
  if (
    alert.kind === "fortnight_report_pending" ||
    alert.kind === "fortnight_report_overdue" ||
    alert.kind === "fortnight_report_needs_regularization"
  ) {
    return (
      <>
        {fortnightReportParagraphs(alert).map((paragraph) => (
          <p key={paragraph} className="text-text text-body">
            {paragraph}
          </p>
        ))}
      </>
    );
  }
  if (alert.kind === "lots_expiring") {
    return (
      <>
        <p className="text-text text-body">{alertDescription(alert)}</p>
        <p className="text-text text-detail">
          Revisar esos productos en el local y avisar para venderlos, bajarlos de precio o
          retirarlos antes de que venzan.
        </p>
      </>
    );
  }
  if (alert.kind === "clock_corrected") {
    return (
      <>
        <p className="text-text text-body">{alertDescription(alert)}</p>
        <ClockCorrectionRows detail={alert.detail} />
      </>
    );
  }
  if (alert.audience !== "local" || !isLocalAlertKind(alert.kind)) {
    return <p className="text-text text-body">{alertDescription(alert)}</p>;
  }
  if (alert.kind === "sales_denied") {
    return <LocalAlertExplanation kind={alert.kind} reason={alert.detail.reason} />;
  }
  if (alert.kind === "late_payment_refund") {
    return (
      <LocalAlertExplanation kind={alert.kind} providerOrderId={alert.detail.providerOrderId} />
    );
  }
  if (alert.kind === "fiscal_emission_stopped") {
    return (
      <>
        <LocalAlertExplanation kind={alert.kind} />
        <p className="text-text text-detail">
          Motivo: {preEmissionCheckReasonLabel(alert.detail.reason)}
        </p>
      </>
    );
  }
  return <LocalAlertExplanation kind={alert.kind} />;
}

export function AlertDetailModal(props: AlertDetailModalProps) {
  const { alertId, ...rest } = props;
  return alertId === null ? null : (
    <OpenAlertDetailModal key={alertId} alertId={alertId} {...rest} />
  );
}

function OpenAlertDetailModal({
  alertId,
  access,
  onClose,
  onClosed,
  onSessionEnded,
  services,
}: Omit<AlertDetailModalProps, "alertId"> & { alertId: string }) {
  const sendToMyAccount = useSendToMyAccount();
  const { fetchAlert, fetchPermissionCatalog, closeAlert } =
    services ?? defaultAlertDetailModalServices;
  const data = useAlertQuery({ id: alertId, fetchAlert, onSessionEnded });
  const refreshAlerts = useRefreshAlerts();
  const refreshAlertsAfterClosing = useRefreshAlertsAfterClosing();
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCloseAlert() {
    setNotice(null);
    setSubmitting(true);
    const outcome = await closeAlert(alertId);
    if (outcome.kind === "ok") {
      onClosed();
      void refreshAlertsAfterClosing(alertId);
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    setSubmitting(false);
    if (outcome.kind === "not_found") {
      void refreshAlerts();
      return;
    }
    if (outcome.kind === "already_closed") {
      setNotice({ kind: "alreadyClosed" });
      void refreshAlerts();
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    setNotice({ kind: "attemptFailed" });
  }

  const alert =
    data.status === "loaded" && data.value.kind === "found" ? data.value.alert : undefined;
  const isKnownClosed = alert !== undefined && !alert.open;
  const isKnownMissing = data.status === "loaded" && alert === undefined;
  const offersClose = canCloseAlertsManually(access) && !isKnownClosed && !isKnownMissing;

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !submitting) {
          onClose();
        }
      }}
      width="standard"
      tone={alert ? ALERT_LEVEL_TONE[alert.level] : "info"}
      icon={alertIcon(alert?.kind ?? "")}
      context="Alerta de seguridad"
      title={alert ? alertTitle(alert) : "Alertas"}
      closable={!submitting}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<ArrowLeft />}
            disabled={submitting}
            onPress={onClose}
          >
            Volver
          </Button>
          {offersClose ? (
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              dataStatus={data.status}
              disabled={submitting}
              onPress={() => void handleCloseAlert()}
            >
              Cerrar la alerta
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudo cerrar la alerta"
            description="Probá de nuevo."
          />
        )}
        {notice?.kind === "alreadyClosed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="Esta alerta ya estaba cerrada"
            description="Alguien más la cerró primero."
          />
        )}
        {notice?.kind === "rateLimited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title="Demasiadas solicitudes"
            description={retryAfterDetail(notice.retryAfterSeconds)}
          />
        )}
        {data.status === "loading" && <LoadingPlaceholder variant="card" lines={4} />}
        {data.status === "failed" && <LoadFailure {...cloudLoadFailure(data, "la alerta")} />}
        {isKnownMissing ? (
          <EmptyState icon={<ShieldX />} title="No encontramos esa alerta" variant="blank" />
        ) : null}
        {alert ? (
          <>
            <div className="flex items-center gap-2">
              <StatusIndicator tone={ALERT_LEVEL_TONE[alert.level]}>
                {levelLabel(alert.level)}
              </StatusIndicator>
            </div>
            {alert.kind === "user_access_increased" &&
            alert.detail.cause === "role_permissions_added" ? (
              <PermissionsAddedDescription
                alert={alert}
                fetchPermissionCatalog={fetchPermissionCatalog}
                onSessionEnded={onSessionEnded}
              />
            ) : (
              <AlertDescription alert={alert} />
            )}
            {alert.kind === "events_quarantined" && canSeeQuarantinedEvents(access) ? (
              <ScreenLink to="/quarantined-events" variant="text">
                Ver eventos en cuarentena
              </ScreenLink>
            ) : null}
            {alert.kind === "lots_expiring" &&
            alert.detail.aboutViewerBranch &&
            canSeeExpiringLots(access) ? (
              <ScreenLink to="/expiring-lots" variant="text">
                Ver vencimientos
              </ScreenLink>
            ) : null}
            <div className="flex flex-col gap-1 rounded-lg border border-border p-3 text-detail">
              <div className="flex justify-between gap-2">
                <span className="text-text-subtle">Abierta</span>
                <span>{alertDateTime(new Date(alert.openedAt))}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-text-subtle">Escaló</span>
                <span>
                  {alert.escalatedAt ? alertDateTime(new Date(alert.escalatedAt)) : "Todavía no"}
                </span>
              </div>
              {alert.scopeDisplay !== null && (
                <div className="flex justify-between gap-2">
                  <span className="text-text-subtle">Alcance</span>
                  <span>{alertScopeLabel(alert.scopeKind, alert.scopeDisplay)}</span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <p className="font-bold text-text text-detail">Aviso por el backoffice</p>
              <div className="flex flex-col gap-1 rounded-lg border border-border text-left text-detail">
                {alert.deliveries.map((delivery) => (
                  <div
                    key={delivery.recipient.id}
                    className="flex items-center justify-between gap-2 border-border border-b px-3 py-2 last:border-b-0"
                  >
                    <span>
                      {delivery.recipient.firstName}
                      {delivery.recipient.role.name ? ` · ${delivery.recipient.role.name}` : ""}
                    </span>
                    <StatusIndicator tone={delivery.status === "sent" ? "success" : "error"}>
                      {delivery.status === "sent"
                        ? "Enviado"
                        : `No se pudo enviar${delivery.error ? `: ${delivery.error}` : ""}`}
                    </StatusIndicator>
                  </div>
                ))}
              </div>
            </div>
            {alert.open && closingNote(alert) !== null ? (
              <p className="text-text-subtle text-detail">{closingNote(alert)}</p>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

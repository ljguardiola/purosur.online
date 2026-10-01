import type { AlertDetail } from "@purosur/contracts";
import {
  type AlertLevel,
  ARGENTINA_TIME_ZONE,
  isPermissionKey,
  PERMISSION_CATALOG,
  type PermissionKey,
} from "@purosur/domain";
import {
  Button,
  EmptyState,
  formatDate,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
  plural,
  StatusIndicator,
} from "@purosur/ui";
import {
  ArrowLeft,
  Bell,
  Check,
  KeyRound,
  Laptop,
  LifeBuoy,
  Mail,
  ShieldAlert,
  ShieldPlus,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import { type ReactElement, useState } from "react";
import { type BackofficeAccess, canCloseAlertsManually } from "../access/backoffice-access";
import { AREA_LABELS, PERMISSION_LABELS } from "../access/permission-labels";
import { roleDisplayName } from "../access/role-display";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import { ALERT_LEVEL_TONE } from "./alert-level-tone";
import { closeAlert as closeAlertDefault, fetchAlert as fetchAlertDefault } from "./alerts-api";
import { useAlertQuery, useRefreshAlerts, useRefreshAlertsAfterClosing } from "./alerts-queries";

type Icon = ReactElement<{ className?: string }>;

const ALERT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: ARGENTINA_TIME_ZONE,
};
const ALERT_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: ARGENTINA_TIME_ZONE,
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
  closeAlert: typeof closeAlertDefault;
};

const defaultAlertDetailModalServices: AlertDetailModalServices = {
  fetchAlert: fetchAlertDefault,
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
    default:
      return <Bell />;
  }
}

// Many permission labels only read clearly under their area's heading, as the role editor shows them.
function permissionLabelWithArea(key: PermissionKey): string {
  const definition = PERMISSION_CATALOG.find((permission) => permission.key === key);
  const label = PERMISSION_LABELS[key];
  return definition ? `${AREA_LABELS[definition.area]}: ${label}` : label;
}

function permissionLabels(keys: readonly string[]): string[] | undefined {
  if (keys.length === 0 || !keys.every(isPermissionKey)) {
    return undefined;
  }
  return keys.map((key) => `«${permissionLabelWithArea(key)}»`);
}

const PERMISSION_LIST_FORMAT = new Intl.ListFormat("es-AR", { type: "conjunction" });

type AccessIncreasedAlert = Extract<AlertDetail, { kind: "user_access_increased" }>;

function accessIncreaseDescription(detail: AccessIncreasedAlert["detail"], targetName: string) {
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
      const labels = permissionLabels(detail.addedPermissionKeys);
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

function alertTitle(alert: AlertDetail): string {
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
  }
}

function alertDescription(alert: AlertDetail): string {
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
      return accessIncreaseDescription(alert.detail, targetName);
    case "register_enrolled":
      return registerEnrollmentDescription(alert.detail, targetName);
  }
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
  const { fetchAlert, closeAlert } = services ?? defaultAlertDetailModalServices;
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
            <p className="text-text text-body">{alertDescription(alert)}</p>
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
                  <span>{alert.scopeDisplay}</span>
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
            {alert.open ? (
              <p className="text-text-subtle text-detail">
                No se cierra sola: se cierra a mano después de revisarla.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

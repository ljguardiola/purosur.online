import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import {
  Button,
  formatDate,
  InlineNotice,
  Modal,
  type NoticeTone,
  plural,
  StatusIndicator,
} from "@purosur/ui";
import {
  ArrowLeft,
  Bell,
  Check,
  KeyRound,
  LifeBuoy,
  Mail,
  ShieldAlert,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { type BackofficeAccess, canCloseAlertsManually } from "../access/backoffice-access";
import { useSendToMyAccount } from "../access/send-to-my-account";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useLatestRef } from "../platform/use-latest-ref";
import {
  type AlertDetail,
  type AlertLevel,
  closeAlert as closeAlertDefault,
  fetchAlert as fetchAlertDefault,
} from "./alerts-api";

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

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; alert: AlertDetail }
  | { kind: "notFound" }
  | { kind: "loadError" }
  | { kind: "rate_limited"; retryAfterSeconds: number };

type FormNotice =
  | { kind: "alreadyClosed" }
  | { kind: "attemptFailed" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

const LEVEL_TONE: Record<AlertLevel, "error" | "warning" | "info"> = {
  critical: "error",
  warning: "warning",
  informational: "info",
};

const MODAL_TONE: Record<AlertLevel, NoticeTone> = {
  critical: "error",
  warning: "warning",
  informational: "info",
};

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
    default:
      return <Bell />;
  }
}

type PasskeyChangeDetail =
  | { action: "registered" | "removed"; passkeyName: string; via: "self" }
  | { action: "registered"; passkeyName: string; via: "recovery" }
  | { action: "removed"; passkeyName: string; via: "administrator"; actorName: string };

function passkeyChangeDetail(detail: Record<string, unknown>): PasskeyChangeDetail | undefined {
  const { action, passkeyName, via, actorName } = detail;
  if (typeof passkeyName !== "string") {
    return undefined;
  }
  if (via === "self" && (action === "registered" || action === "removed")) {
    return { action, passkeyName, via };
  }
  if (via === "recovery" && action === "registered") {
    return { action, passkeyName, via };
  }
  if (via === "administrator" && action === "removed" && typeof actorName === "string") {
    return { action, passkeyName, via, actorName };
  }
  return undefined;
}

function alertTitle(alert: AlertDetail): string {
  switch (alert.kind) {
    case "backoffice_passkey_changed": {
      const detail = passkeyChangeDetail(alert.detail);
      return detail?.action === "removed"
        ? "Se dio de baja una passkey"
        : "Se registró una passkey";
    }
    case "backoffice_recovery_requested":
      return "Se pidió el enlace de acceso";
    case "user_email_changed":
      return "Se cambió un correo";
    case "backoffice_sign_in_lockout":
      return "Se bloqueó un origen de ingreso";
    default:
      return alert.kind;
  }
}

function alertDescription(alert: AlertDetail): string {
  if (alert.kind === "backoffice_sign_in_lockout") {
    const failureCount =
      typeof alert.detail["failureCount"] === "number" ? alert.detail["failureCount"] : 0;
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
      const detail = passkeyChangeDetail(alert.detail);
      if (!detail) {
        return "";
      }
      if (detail.via === "self") {
        return detail.action === "registered"
          ? `${targetName} registró la passkey «${detail.passkeyName}». Si no se reconoce este cambio, conviene dar de baja esa passkey desde Usuarios.`
          : `${targetName} dio de baja la passkey «${detail.passkeyName}». Si no se reconoce este cambio, conviene revisar sus passkeys desde Usuarios.`;
      }
      if (detail.via === "recovery") {
        return `${targetName} registró la passkey «${detail.passkeyName}» al usar el enlace de recuperación de acceso. Si no se reconoce este cambio, conviene dar de baja esa passkey desde Usuarios.`;
      }
      return `El Administrador ${detail.actorName} dio de baja la passkey «${detail.passkeyName}» de ${targetName}. Si no fue así, conviene revisarlo.`;
    }
    case "backoffice_recovery_requested":
      return `Alguien pidió el enlace de acceso para ${targetName}. Si no se reconoce este pedido, conviene revisar sus passkeys desde Usuarios.`;
    case "user_email_changed": {
      const { previousEmail, newEmail, actorName } = alert.detail;
      if (
        typeof previousEmail !== "string" ||
        typeof newEmail !== "string" ||
        typeof actorName !== "string"
      ) {
        return "";
      }
      return `El Administrador ${actorName} cambió el correo de ${targetName} de ${previousEmail} a ${newEmail}.`;
    }
    default:
      return "";
  }
}

export function AlertDetailModal({
  alertId,
  access,
  onClose,
  onClosed,
  onSessionEnded,
  services,
}: AlertDetailModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const { fetchAlert, closeAlert } = services ?? defaultAlertDetailModalServices;
  const [loadState, setLoadState] = useState<LoadState>({ kind: "idle" });
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sessionRef = useRef(0);
  const onSessionEndedRef = useLatestRef(onSessionEnded);

  const load = useCallback(
    async (id: string) => {
      const session = sessionRef.current;
      setLoadState({ kind: "loading" });
      const outcome = await fetchAlert(id);
      if (session !== sessionRef.current) {
        return;
      }
      if (outcome.kind === "ok") {
        setLoadState({ kind: "loaded", alert: outcome.value });
        return;
      }
      if (outcome.kind === "unauthenticated") {
        onSessionEndedRef.current();
        return;
      }
      if (outcome.kind === "forbidden") {
        sendToMyAccount();
        return;
      }
      if (outcome.kind === "not_found") {
        setLoadState({ kind: "notFound" });
        return;
      }
      if (outcome.kind === "rate_limited") {
        setLoadState({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setLoadState({ kind: "loadError" });
    },
    [fetchAlert, sendToMyAccount, onSessionEndedRef],
  );

  useEffect(() => {
    sessionRef.current += 1;
    setNotice(null);
    setSubmitting(false);
    if (alertId) {
      void load(alertId);
    } else {
      setLoadState({ kind: "idle" });
    }
  }, [alertId, load]);

  async function handleCloseAlert() {
    if (!alertId) {
      return;
    }
    const session = sessionRef.current;
    setNotice(null);
    setSubmitting(true);
    const outcome = await closeAlert(alertId);
    if (session !== sessionRef.current) {
      return;
    }
    if (outcome.kind === "ok") {
      onClosed();
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEndedRef.current();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "not_found") {
      setLoadState({ kind: "notFound" });
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "already_closed") {
      setNotice({ kind: "alreadyClosed" });
      setSubmitting(false);
      void load(alertId);
      return;
    }
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "attemptFailed" });
    setSubmitting(false);
  }

  const alert = loadState.kind === "loaded" ? loadState.alert : undefined;
  const canClose =
    alert !== undefined && alert.resolvedAt === null && canCloseAlertsManually(access);

  return (
    <Modal
      open={alertId !== null}
      onOpenChange={(open) => {
        if (!open && !submitting) {
          onClose();
        }
      }}
      width="standard"
      tone={alert ? MODAL_TONE[alert.level] : "info"}
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
          {canClose ? (
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
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
        {loadState.kind === "loading" && <p role="status">Cargando la alerta…</p>}
        {loadState.kind === "notFound" && (
          <InlineNotice tone="error" icon={<ShieldX />} title="No encontramos esa alerta" />
        )}
        {loadState.kind === "loadError" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No pudimos abrir la alerta"
            description="Probá de nuevo en unos minutos."
          />
        )}
        {loadState.kind === "rate_limited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title="Demasiadas solicitudes"
            description={retryAfterDetail(loadState.retryAfterSeconds)}
          />
        )}
        {alertId !== null &&
          (loadState.kind === "loadError" || loadState.kind === "rate_limited") && (
            <div>
              <Button variant="secondary" onPress={() => void load(alertId)}>
                Reintentar
              </Button>
            </div>
          )}
        {alert ? (
          <>
            <div className="flex items-center gap-2">
              <StatusIndicator tone={LEVEL_TONE[alert.level]}>
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
            {alert.resolvedAt === null && (
              <p className="text-text-subtle text-detail">
                No se cierra sola: se cierra a mano después de revisarla.
              </p>
            )}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

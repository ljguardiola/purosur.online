import { Button, InlineNotice, Modal, type ModalTone, StatusIndicator } from "@purosur/ui";
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
import { type BackofficeAccess, canCloseAlertsManually } from "./access";
import {
  type AlertDetail,
  type AlertLevel,
  closeAlert as closeAlertDefault,
  fetchAlert as fetchAlertDefault,
} from "./alertsApi";
import { messages } from "./messages";
import { sendToMyAccount } from "./settingsRoutes";

type Icon = ReactElement<{ className?: string }>;

export type AlertDetailModalServices = {
  fetchAlert: typeof fetchAlertDefault;
  closeAlert: typeof closeAlertDefault;
};

export const defaultAlertDetailModalServices: AlertDetailModalServices = {
  fetchAlert: fetchAlertDefault,
  closeAlert: closeAlertDefault,
};

export type AlertDetailModalProps = {
  /** `null` keeps the modal closed; opening one fetches its detail fresh. */
  alertId: string | null;
  access: BackofficeAccess;
  onClose: () => void;
  /** Fired after a successful close, so the list can refresh; the modal is left to the caller to close too. */
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

const alertsMessages = messages.inicio.alerts;
const detailMessages = alertsMessages.detail;

const LEVEL_TONE: Record<AlertLevel, "error" | "warning" | "info"> = {
  critical: "error",
  warning: "warning",
  informational: "info",
};

const MODAL_TONE: Record<AlertLevel, ModalTone> = {
  critical: "error",
  warning: "warning",
  informational: "info",
};

function levelLabel(level: AlertLevel): string {
  return alertsMessages.levelOptions[level];
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

type PasskeyChangeDetail = {
  action: "registered" | "removed";
  passkeyName: string;
  via: "self" | "administrator" | "recovery";
  actorName?: string;
};

function passkeyChangeDetail(detail: Record<string, unknown>): PasskeyChangeDetail | undefined {
  const { action, passkeyName, via, actorName } = detail;
  if (
    (action === "registered" || action === "removed") &&
    typeof passkeyName === "string" &&
    (via === "self" || via === "administrator" || via === "recovery")
  ) {
    return { action, passkeyName, via, ...(typeof actorName === "string" ? { actorName } : {}) };
  }
  return undefined;
}

function alertTitle(alert: AlertDetail): string {
  switch (alert.kind) {
    case "backoffice_passkey_changed": {
      const detail = passkeyChangeDetail(alert.detail);
      return detail?.action === "removed"
        ? alertsMessages.kindTitles.passkeyRemoved
        : alertsMessages.kindTitles.passkeyRegistered;
    }
    case "backoffice_recovery_requested":
      return alertsMessages.kindTitles.recoveryRequested;
    case "user_email_changed":
      return alertsMessages.kindTitles.emailChanged;
    case "backoffice_sign_in_lockout":
      return alertsMessages.kindTitles.signInLockout;
    default:
      return alert.kind;
  }
}

function alertDescription(alert: AlertDetail): string {
  const targetName = alert.scopeDisplay;
  switch (alert.kind) {
    case "backoffice_passkey_changed": {
      const detail = passkeyChangeDetail(alert.detail);
      if (!detail) {
        return "";
      }
      if (detail.via === "self") {
        return detail.action === "registered"
          ? detailMessages.descriptions.passkeyRegisteredSelf({
              targetName,
              passkeyName: detail.passkeyName,
            })
          : detailMessages.descriptions.passkeyRemovedSelf({
              targetName,
              passkeyName: detail.passkeyName,
            });
      }
      if (detail.via === "recovery") {
        return detail.action === "registered"
          ? detailMessages.descriptions.passkeyRegisteredByRecovery({
              targetName,
              passkeyName: detail.passkeyName,
            })
          : detailMessages.descriptions.passkeyRemovedByRecovery({
              targetName,
              passkeyName: detail.passkeyName,
            });
      }
      const actorName = detail.actorName ?? alertsMessages.unknownAdministrator;
      return detail.action === "registered"
        ? detailMessages.descriptions.passkeyRegisteredByAdministrator({
            actorName,
            targetName,
            passkeyName: detail.passkeyName,
          })
        : detailMessages.descriptions.passkeyRemovedByAdministrator({
            actorName,
            targetName,
            passkeyName: detail.passkeyName,
          });
    }
    case "backoffice_recovery_requested":
      return detailMessages.descriptions.recoveryRequested({ targetName });
    case "user_email_changed": {
      const previousEmail =
        typeof alert.detail.previousEmail === "string" ? alert.detail.previousEmail : "";
      const newEmail = typeof alert.detail.newEmail === "string" ? alert.detail.newEmail : "";
      const actorName =
        typeof alert.detail.actorName === "string"
          ? alert.detail.actorName
          : alertsMessages.unknownAdministrator;
      return detailMessages.descriptions.emailChanged({
        actorName,
        targetName,
        previousEmail,
        newEmail,
      });
    }
    case "backoffice_sign_in_lockout": {
      const failureCount =
        typeof alert.detail.failureCount === "number" ? alert.detail.failureCount : 0;
      return detailMessages.descriptions.signInLockout({ sourceAddress: targetName, failureCount });
    }
    default:
      return "";
  }
}

/**
 * The alert detail modal over the Alertas list (never its own route, the same pattern
 * `RoleEditorModal` uses over Roles): opens on an eye action, shows the level, a description
 * built from the kind's own fact payload, the open/escalated/scope data, per-recipient delivery,
 * and — only for a viewer who holds `dismiss_alerts_manually`, on an alert still open — a "Cerrar
 * la alerta" action.
 */
export function AlertDetailModal({
  alertId,
  access,
  onClose,
  onClosed,
  onSessionEnded,
  services,
}: AlertDetailModalProps) {
  const { fetchAlert, closeAlert } = services ?? defaultAlertDetailModalServices;
  const [loadState, setLoadState] = useState<LoadState>({ kind: "idle" });
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Bumped on every alertId change, so a fetch started for an earlier alert (one since closed or
  // replaced) knows its late response no longer belongs here.
  const sessionRef = useRef(0);
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

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
    [fetchAlert],
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
      isOpen={alertId !== null}
      onOpenChange={(open) => {
        if (!open && !submitting) {
          onClose();
        }
      }}
      width="standard"
      tone={alert ? MODAL_TONE[alert.level] : "info"}
      icon={alertIcon(alert?.kind ?? "")}
      context={detailMessages.eyebrow}
      title={alert ? alertTitle(alert) : alertsMessages.heading}
      {...(submitting
        ? { closable: false }
        : { closable: true, closeLabel: detailMessages.closeLabel })}
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<ArrowLeft />}
            isDisabled={submitting}
            onPress={onClose}
          >
            {detailMessages.back}
          </Button>
          {canClose && (
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              isDisabled={submitting}
              onPress={() => void handleCloseAlert()}
            >
              {detailMessages.closeAlert}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={detailMessages.closeFailedTitle}
            detail={detailMessages.closeFailedDetail}
          />
        )}
        {notice?.kind === "alreadyClosed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={detailMessages.alreadyClosedTitle}
            detail={detailMessages.alreadyClosedDetail}
          />
        )}
        {notice?.kind === "rateLimited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title={alertsMessages.rateLimitedTitle}
            detail={alertsMessages.rateLimitedDetail({
              minutes: Math.ceil(notice.retryAfterSeconds / 60),
            })}
          />
        )}
        {loadState.kind === "loading" && <p role="status">{detailMessages.loading}</p>}
        {loadState.kind === "notFound" && (
          <InlineNotice tone="error" icon={<ShieldX />} title={detailMessages.notFoundTitle} />
        )}
        {loadState.kind === "loadError" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={detailMessages.loadErrorTitle}
            detail={detailMessages.loadErrorDetail}
          />
        )}
        {loadState.kind === "rate_limited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title={alertsMessages.rateLimitedTitle}
            detail={alertsMessages.rateLimitedDetail({
              minutes: Math.ceil(loadState.retryAfterSeconds / 60),
            })}
          />
        )}
        {alert && (
          <>
            <div className="flex items-center gap-2">
              <StatusIndicator tone={LEVEL_TONE[alert.level]}>
                {levelLabel(alert.level)}
              </StatusIndicator>
              {alert.escalatedAt && (
                <p className="text-ink-secondary text-sm">{detailMessages.escalationLine}</p>
              )}
            </div>
            <p className="text-ink text-base">{alertDescription(alert)}</p>
            <div className="flex flex-col gap-1 rounded-lg border border-line p-3 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-ink-secondary">{detailMessages.openedLabel}</span>
                <span>{alertsMessages.dateTime({ date: new Date(alert.openedAt) })}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-ink-secondary">{detailMessages.escalatedLabel}</span>
                <span>
                  {alert.escalatedAt
                    ? alertsMessages.dateTime({ date: new Date(alert.escalatedAt) })
                    : detailMessages.notEscalatedYet}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-ink-secondary">{detailMessages.scopeLabel}</span>
                <span>{alert.scopeDisplay}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="font-bold text-ink text-sm">{detailMessages.deliveriesTitle}</p>
              <div className="flex flex-col gap-1 rounded-lg border border-line text-left text-sm">
                {alert.deliveries.map((delivery) => (
                  <div
                    key={delivery.recipient.id}
                    className="flex items-center justify-between gap-2 border-line border-b px-3 py-2 last:border-b-0"
                  >
                    <span>
                      {delivery.recipient.firstName}
                      {delivery.recipient.role.name ? ` · ${delivery.recipient.role.name}` : ""}
                    </span>
                    <StatusIndicator tone={delivery.status === "sent" ? "success" : "error"}>
                      {delivery.status === "sent"
                        ? detailMessages.deliverySent
                        : `${detailMessages.deliveryFailed}${delivery.error ? `: ${delivery.error}` : ""}`}
                    </StatusIndicator>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-ink-secondary text-sm">{detailMessages.closingNote}</p>
          </>
        )}
      </div>
    </Modal>
  );
}

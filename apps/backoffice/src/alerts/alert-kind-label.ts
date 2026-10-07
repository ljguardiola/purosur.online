import type { AlertKind } from "@purosur/domain";

const ALERT_KIND_LABELS = {
  backoffice_passkey_changed: "Passkey",
  backoffice_recovery_requested: "Recuperación de acceso",
  user_email_changed: "Correo",
  backoffice_sign_in_lockout: "Bloqueo de ingreso",
  user_access_increased: "Acceso ampliado",
  register_enrolled: "Alta de caja",
  events_quarantined: "Cuarentena de eventos",
  event_invariant_violated: "Inconsistencia en un evento",
} satisfies Record<AlertKind, string>;

export function alertKindLabel(kind: string): string {
  return kind in ALERT_KIND_LABELS
    ? ALERT_KIND_LABELS[kind as keyof typeof ALERT_KIND_LABELS]
    : kind;
}

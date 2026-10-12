import type { AlertKind } from "@purosur/domain";

const ALERT_KIND_DESCRIPTIONS = {
  backoffice_passkey_changed: "Se registró o dio de baja una passkey",
  backoffice_recovery_requested: "Se pidió el enlace de acceso",
  user_email_changed: "Se cambió una dirección de correo",
  backoffice_sign_in_lockout: "Demasiados intentos fallidos de ingreso",
  user_access_increased: "Se amplió el acceso de un usuario",
  register_enrolled: "Se dio de alta una caja",
  events_quarantined: "Evento de una caja en cuarentena",
  event_invariant_violated: "Evento aplicado con una inconsistencia",
  arca_certificate_expiring: "El certificado de ARCA está por vencer",
  arca_wsaa_ticket_held:
    "La emisión fiscal en línea espera a que venza el ticket de acceso que ARCA todavía tiene vigente.",
  update_required: "La nube ya no acepta la versión de esta caja",
  register_silent: "Una caja dejó de sincronizar",
  sales_denied: "Una caja dejó de abrir ventas nuevas",
  fiscal_rejected: "ARCA rechazó una factura",
  offline_authorization_code_missing: "Una caja todavía no bajó el CAEA de la quincena",
  late_payment_refund: "Mercado Pago cobró un pago QR que hay que devolver",
  refund_task: "Una venta anulada tiene un reembolso sin marcar como hecho",
} satisfies Record<AlertKind, string>;

export const DESCRIBED_ALERT_KINDS: readonly string[] = Object.keys(ALERT_KIND_DESCRIPTIONS);

export function alertKindDescription(kind: string): string {
  return Object.hasOwn(ALERT_KIND_DESCRIPTIONS, kind)
    ? ALERT_KIND_DESCRIPTIONS[kind as keyof typeof ALERT_KIND_DESCRIPTIONS]
    : "";
}

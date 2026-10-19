import type { AlertKind } from "@purosur/domain";

const ALERT_KIND_LABELS = {
  backoffice_passkey_changed: "Passkey",
  backoffice_recovery_requested: "Recuperación de acceso",
  user_email_changed: "Correo",
  backoffice_sign_in_lockout: "Bloqueo de ingreso",
  user_access_increased: "Acceso ampliado",
  register_enrolled: "Cambio de instalación de caja",
  events_quarantined: "Cuarentena de eventos",
  event_invariant_violated: "Inconsistencia en un evento",
  arca_certificate_expiring: "Certificado de ARCA por vencer",
  arca_wsaa_ticket_held: "ARCA conserva un ticket de acceso anterior",
  update_required: "Versión de caja no aceptada",
  register_silent: "Caja sin sincronizar",
  sales_denied: "Caja sin poder vender",
  fiscal_rejected: "Factura rechazada por ARCA",
  offline_authorization_code_missing: "CAEA sin bajar a la caja",
  late_payment_refund: "Reembolso pendiente por un pago tardío",
  refund_task: "Reembolso pendiente de una venta anulada",
  fiscal_unknown: "Resultado fiscal incierto",
  fiscal_emission_stopped: "Emisión de facturas detenida",
  outbox_chain_broken: "Cadena de eventos alterada",
  lots_expiring: "Productos por vencer",
  offsite_dump_unverified: "Copia de seguridad externa sin verificar",
  fortnight_report_pending: "Informe de quincena pendiente",
  fortnight_report_overdue: "Informe de quincena vencido",
  external_billing: "Facturación externa",
  fortnight_report_needs_regularization: "Quincena a regularizar",
  clock_corrected: "Reloj de la caja corregido",
  invoice_already_credited: "Factura ya acreditada",
  clock_drift: "Reloj de la caja desajustado",
} satisfies Record<AlertKind, string>;

export function alertKindLabel(kind: string): string {
  return Object.hasOwn(ALERT_KIND_LABELS, kind)
    ? ALERT_KIND_LABELS[kind as keyof typeof ALERT_KIND_LABELS]
    : kind;
}

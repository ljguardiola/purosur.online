import type { AlertKind } from "@purosur/domain";

const ALERT_KIND_DESCRIPTIONS = {
  backoffice_passkey_changed: "Se registró o dio de baja una passkey",
  backoffice_recovery_requested: "Se pidió el enlace de acceso",
  user_email_changed: "Se cambió una dirección de correo",
  backoffice_sign_in_lockout: "Demasiados intentos fallidos de ingreso",
  user_access_increased: "Se amplió el acceso de un usuario",
  register_enrolled: "Se dio de alta o se revocó una instalación de caja",
  events_quarantined: "Eventos de una caja en cuarentena",
  event_invariant_violated: "Evento aplicado con una inconsistencia",
  arca_certificate_expiring: "El certificado de ARCA está por vencer",
  arca_wsaa_ticket_held:
    "La emisión fiscal en línea espera a que venza el ticket de acceso que ARCA todavía tiene vigente.",
  update_required: "La nube ya no acepta la versión de esta caja",
  register_silent: "Una caja dejó de sincronizar",
  sales_denied: "Una caja dejó de abrir ventas nuevas",
  fiscal_rejected: "ARCA rechazó una factura",
  offline_authorization_code_missing: "Una caja todavía no bajó el CAEA de la quincena",
  late_payment_refund: "Mercado Pago cobró un pago que hay que devolver",
  refund_task: "Una venta anulada tiene un reembolso pendiente",
  fiscal_unknown: "Un comprobante quedó sin respuesta clara de ARCA",
  fiscal_emission_stopped: "Una caja no puede emitir comprobantes fiscales",
  outbox_chain_broken: "Eventos de una caja alterados en su disco",
  lots_expiring: "Hay lotes de productos vencidos o por llegar a su fecha de vencimiento.",
  offsite_dump_unverified:
    "La copia cifrada de la base de datos de una noche no se pudo verificar fuera de la nube.",
  fortnight_report_pending:
    "Falta presentar a ARCA el informe de una quincena de un punto de venta",
  fortnight_report_overdue:
    "Venció el plazo para presentar a ARCA el informe de una quincena de un punto de venta",
  external_billing: "Un comprobante se emitió fuera del sistema",
  fortnight_report_needs_regularization:
    "Llegaron comprobantes de una quincena ya informada a ARCA sin movimiento",
  invoice_already_credited:
    "Se anuló una venta cuya factura ya tenía una nota de crédito, por lo que no se emitió otra",
  fortnight_report_owed_elsewhere:
    "ARCA informa adeudada la presentación de una quincena de un punto de venta que este sistema no maneja",
  clock_corrected:
    "Alguien confirmó desde la caja que su hora era correcta, aunque quedó atrás de la del último comprobante emitido.",
  register_backup_overdue:
    "Una caja registró cambios y lleva más de una hora sin un backup verificado",
  clock_drift: "La hora de una caja difiere en más de un minuto de la hora real",
} satisfies Record<AlertKind, string>;

export const DESCRIBED_ALERT_KINDS: readonly string[] = Object.keys(ALERT_KIND_DESCRIPTIONS);

export function alertKindDescription(kind: string): string {
  return Object.hasOwn(ALERT_KIND_DESCRIPTIONS, kind)
    ? ALERT_KIND_DESCRIPTIONS[kind as keyof typeof ALERT_KIND_DESCRIPTIONS]
    : "";
}

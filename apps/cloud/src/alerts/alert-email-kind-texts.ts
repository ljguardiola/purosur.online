import type { AlertKind } from "@purosur/domain";

type EmailedAlertKind =
  | "backoffice_passkey_changed"
  | "backoffice_recovery_requested"
  | "user_email_changed"
  | "alert_recipients_changed"
  | "backoffice_sign_in_lockout"
  | "user_access_increased"
  | "register_enrolled"
  | "events_quarantined"
  | "arca_certificate_expiring"
  | "update_required"
  | "register_silent"
  | "sales_denied"
  | "fiscal_rejected"
  | "fiscal_unknown"
  | "fiscal_emission_stopped"
  | "clock_drift"
  | "register_replenishment_failed"
  | "on_battery"
  | "outbox_chain_broken"
  | "offsite_dump_unverified"
  | "fortnight_report_overdue"
  | "register_backup_overdue"
  | "fortnight_report_document_rejected";

export interface AlertEmailKindTexts {
  label: string;
  description: string;
}

const ALERT_EMAIL_KIND_TEXTS = {
  backoffice_passkey_changed: {
    label: "Passkey",
    description: "Se registró o dio de baja una passkey",
  },
  backoffice_recovery_requested: {
    label: "Recuperación de acceso",
    description: "Se pidió el enlace de acceso",
  },
  user_email_changed: {
    label: "Correo",
    description: "Se cambió una dirección de correo",
  },
  alert_recipients_changed: {
    label: "Cambió quién recibe alertas por email",
    description: "Alguien empezó o dejó de recibir las alertas por email.",
  },
  backoffice_sign_in_lockout: {
    label: "Bloqueo de ingreso",
    description: "Demasiados intentos fallidos de ingreso",
  },
  user_access_increased: {
    label: "Acceso ampliado",
    description: "Se amplió el acceso de un usuario",
  },
  register_enrolled: {
    label: "Cambio de instalación de caja",
    description: "Se dio de alta o se revocó una instalación de caja",
  },
  events_quarantined: {
    label: "Cambios de cajas retenidos",
    description: "Cambios de una caja retenidos",
  },
  arca_certificate_expiring: {
    label: "Certificado de ARCA por vencer",
    description: "El certificado de ARCA está por vencer",
  },
  update_required: {
    label: "Versión de caja no aceptada",
    description: "La nube ya no acepta la versión de esta caja",
  },
  register_silent: {
    label: "Caja sin sincronizar",
    description: "Una caja dejó de sincronizar",
  },
  sales_denied: {
    label: "Caja sin poder vender",
    description: "Una caja dejó de abrir ventas nuevas",
  },
  fiscal_rejected: {
    label: "Factura rechazada por ARCA",
    description: "ARCA rechazó una factura",
  },
  fiscal_unknown: {
    label: "Resultado fiscal incierto",
    description: "Un comprobante quedó sin respuesta clara de ARCA",
  },
  fiscal_emission_stopped: {
    label: "Emisión de facturas detenida",
    description: "Una caja no puede emitir comprobantes fiscales",
  },
  clock_drift: {
    label: "Reloj de la caja desajustado",
    description: "La hora de una caja difiere en más de un minuto de la hora real",
  },
  register_replenishment_failed: {
    label: "Caja sin poder ponerse al día",
    description: "Una caja restaurada no puede ponerse al día con la nube y no puede vender",
  },
  on_battery: {
    label: "Caja funcionando con batería",
    description: "Una caja lleva un rato funcionando solo con la batería",
  },
  outbox_chain_broken: {
    label: "Cadena de eventos alterada",
    description: "Eventos de una caja alterados en su disco",
  },
  offsite_dump_unverified: {
    label: "Copia de seguridad externa sin verificar",
    description:
      "La copia cifrada de la base de datos de una noche no se pudo verificar fuera de la nube.",
  },
  fortnight_report_overdue: {
    label: "Informe de quincena vencido",
    description:
      "Venció el plazo para presentar a ARCA el informe de una quincena de un punto de venta",
  },
  register_backup_overdue: {
    label: "Caja sin backup verificado",
    description: "Una caja registró cambios y lleva más de una hora sin un backup verificado",
  },
  fortnight_report_document_rejected: {
    label: "Comprobante rechazado en un informe quincenal",
    description:
      "ARCA rechazó un comprobante de una quincena y los que le siguen quedan sin procesar hasta que se corrija",
  },
} satisfies Record<EmailedAlertKind, AlertEmailKindTexts>;

export function alertEmailKindTexts(kind: AlertKind): AlertEmailKindTexts | undefined {
  return Object.hasOwn(ALERT_EMAIL_KIND_TEXTS, kind)
    ? ALERT_EMAIL_KIND_TEXTS[kind as EmailedAlertKind]
    : undefined;
}

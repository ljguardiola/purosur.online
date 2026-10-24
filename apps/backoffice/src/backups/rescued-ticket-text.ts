import {
  type ContingencyBackupTicketRescueResponse,
  contingencyBackupTicketRescueResponseSchema,
} from "@purosur/contracts";
import { formatDate, formatInvoiceNumber, formatPointOfSaleNumber } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

type Rescued = Extract<ContingencyBackupTicketRescueResponse, { outcome: "rescued" }>;
type Summary = Rescued["summary"];
export type RefusedOutcome = Exclude<ContingencyBackupTicketRescueResponse["outcome"], "rescued">;

const [rescuedShape] = contingencyBackupTicketRescueResponseSchema.options;
const OCCURRED_AT_TIME_ZONE = schemaText(
  rescuedShape.shape.summary.shape.occurred_at.meta()?.["timeZone"],
);

const OPERATION_LABEL: Record<NonNullable<Summary["operation"]>, string> = {
  sale: "Venta",
  paid_sale_cancellation: "Anulación de una venta cobrada",
  sale_void: "Anulación de una venta",
  cash_movement: "Movimiento de caja",
  cash_session_opening: "Apertura de caja",
  cash_session_closing: "Cierre de caja",
  initial_count: "Conteo inicial",
  clock_correction: "Corrección del reloj",
  reprint: "Reimpresión",
};

const VOUCHER_LABEL: Record<Summary["vouchers"][number]["document_type"], string> = {
  factura_c: "Factura C",
  credit_note_c: "Nota de crédito C",
};

export const REFUSED_TICKET_TITLE: Record<RefusedOutcome, string> = {
  unreadable: "QR ilegible o de otro sistema",
  incomplete: "Faltan QR de este ticket",
  unknown_key: "Clave de cifrado desconocida",
  not_authentic: "El ticket no es auténtico",
  foreign_installation: "Ticket de otra instalación",
  conflicting: "Los QR no son del mismo ticket",
};

export function rescuedTicketTitle({ operation, occurred_at }: Summary): string {
  const label = operation === null ? "Ticket" : OPERATION_LABEL[operation];
  if (occurred_at === null) {
    return label;
  }
  const moment = new Date(occurred_at);
  const day = formatDate(moment, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: OCCURRED_AT_TIME_ZONE,
  });
  const clock = formatDate(moment, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: OCCURRED_AT_TIME_ZONE,
  });
  return `${label} del ${day} ${clock}`;
}

export function rescuedTicketVouchersText({ vouchers }: Summary): string | undefined {
  if (vouchers.length === 0) {
    return undefined;
  }
  const written = vouchers.map(
    (voucher) =>
      `${VOUCHER_LABEL[voucher.document_type]} ${formatPointOfSaleNumber(voucher.point_of_sale)}-${formatInvoiceNumber(voucher.number)}`,
  );
  return `${written.join(", ")} · CAEA`;
}

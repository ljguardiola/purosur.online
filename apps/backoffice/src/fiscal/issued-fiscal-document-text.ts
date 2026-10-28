import {
  type IssuedFiscalDocumentDetailBody,
  type IssuedFiscalDocumentsBody,
  issuedFiscalDocumentsSchema,
} from "@purosur/contracts";
import {
  formatCalendarDayNumeric,
  formatDate,
  formatInvoiceNumber,
  formatNumber,
  formatPointOfSaleNumber,
  plural,
} from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

type IssuedFiscalDocument = IssuedFiscalDocumentsBody["documents"][number];
type Voucher = { voucher_type: number; point_of_sale: number; number: number };

const ISSUED_AT_TIME_ZONE = schemaText(
  issuedFiscalDocumentsSchema.shape.documents.element.shape.issued_at.meta()?.["timeZone"],
);

const VOUCHER_TYPE_NAMES: Record<number, string> = {
  11: "Factura C",
  13: "Nota de crédito C",
};

export function voucherTypeText(voucherType: number): string {
  return VOUCHER_TYPE_NAMES[voucherType] ?? `Comprobante tipo ${voucherType}`;
}

export function voucherText(voucher: Voucher): string {
  const name = voucherTypeText(voucher.voucher_type);
  return `${name} ${formatPointOfSaleNumber(voucher.point_of_sale)}-${formatInvoiceNumber(voucher.number)}`;
}

export function voucherDetailText(document: IssuedFiscalDocument): string {
  return [
    document.register.name,
    document.corrected_voucher === null
      ? null
      : `Anula la ${voucherText(document.corrected_voucher)}`,
    document.contingency ? "en contingencia" : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}

export function authorizationText(authorization: IssuedFiscalDocument["authorization"]): string {
  if (authorization === null) {
    return "Sin autorización todavía";
  }
  return `${authorization.kind === "cae" ? "CAE" : "CAEA"} ${authorization.code}`;
}

export function authorizationDetailText(document: IssuedFiscalDocument): string | undefined {
  const { authorization } = document;
  if (authorization?.kind === "cae") {
    return `Vence el ${formatCalendarDayNumeric(authorization.due_on)}`;
  }
  if (authorization?.kind === "caea") {
    return `Quincena ${formatCalendarDayNumeric(authorization.fortnight_start).slice(0, 2)} al ${formatCalendarDayNumeric(authorization.fortnight_end).slice(0, 5)}`;
  }
  return document.state === "awaiting_authorization" ? "No se reintenta sin consultar" : undefined;
}

export function issuedDay(document: IssuedFiscalDocument): string {
  return formatCalendarDayNumeric(document.issued_on);
}

export function issuedTime(document: IssuedFiscalDocument): string {
  return formatDate(new Date(document.issued_at), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: ISSUED_AT_TIME_ZONE,
  });
}

export function documentsCountText(
  count: number,
  range: IssuedFiscalDocumentsBody["range"],
): string {
  const period =
    range.from === range.to
      ? formatCalendarDayNumeric(range.from)
      : `del ${formatCalendarDayNumeric(range.from)} al ${formatCalendarDayNumeric(range.to)}`;
  return `${plural(count, { one: "1 comprobante", other: `${formatNumber(count)} comprobantes` })} · ${period}`;
}

type IdentifiedBuyer = Extract<IssuedFiscalDocumentDetailBody["buyer"], { kind: "identified" }>;

function taxIdText(number: number): string {
  const digits = String(number).padStart(11, "0");
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

const BUYER_DOCUMENTS: Record<
  IdentifiedBuyer["document_kind"],
  { name: string; numberText: (number: number) => string }
> = {
  cuit: { name: "CUIT", numberText: taxIdText },
  cuil: { name: "CUIL", numberText: taxIdText },
  cdi: { name: "CDI", numberText: String },
  dni: { name: "DNI", numberText: String },
  other: { name: "Documento", numberText: String },
};

export function buyerText(buyer: IssuedFiscalDocumentDetailBody["buyer"]): string {
  if (buyer.kind === "final_consumer") {
    return "Consumidor final";
  }
  const { name, numberText } = BUYER_DOCUMENTS[buyer.document_kind];
  return `${name} ${numberText(buyer.document_number)}`;
}

export function correctedVoucherText(voucher: Voucher): string {
  return `Corrige la ${voucherText(voucher)}`;
}

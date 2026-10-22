import { type CalendarDate, parseDate } from "@internationalized/date";
import type { RejectedDocumentRemedyBody } from "@purosur/contracts";
import { formatAmountInput, formatCalendarDayRange, parseAmountCents } from "@purosur/ui";
import type { BuyerTaxStatus } from "./buyer-tax-statuses-api";
import type { CorrectionRefusal, RejectedDocument } from "./fortnight-presentations-api";

type PresentedValues = Pick<
  RejectedDocument,
  "issuedOn" | "total" | "buyer" | "buyerTaxStatusCode"
>;

export type RemedyFormValues = {
  pointOfSaleNumber: number;
  fortnightStart: string;
  number: number;
  presented: PresentedValues;
  errorIn: "report" | "printed";
  issuedOn: CalendarDate | null;
  total: string;
  buyerKind: "final_consumer" | "cuit";
  buyerCuit: string;
  buyerTaxStatusCode: string;
};

export type RemedyTarget = {
  pointOfSaleNumber: number;
  fortnight: { start: string; end: string };
  rejectedDocument: RejectedDocument;
};

export const EMPTY_REMEDY_FORM: RemedyFormValues = {
  pointOfSaleNumber: 0,
  fortnightStart: "",
  number: 0,
  presented: {
    issuedOn: "",
    total: 0,
    buyer: { kind: "final_consumer" },
    buyerTaxStatusCode: 0,
  },
  errorIn: "report",
  issuedOn: null,
  total: "",
  buyerKind: "final_consumer",
  buyerCuit: "",
  buyerTaxStatusCode: "",
};

export function remedyFormValuesFrom({
  pointOfSaleNumber,
  fortnight,
  rejectedDocument,
}: RemedyTarget): RemedyFormValues {
  const { buyer } = rejectedDocument;
  return {
    pointOfSaleNumber,
    fortnightStart: fortnight.start,
    number: rejectedDocument.number,
    presented: {
      issuedOn: rejectedDocument.issuedOn,
      total: rejectedDocument.total,
      buyer,
      buyerTaxStatusCode: rejectedDocument.buyerTaxStatusCode,
    },
    errorIn: "report",
    issuedOn: parseDate(rejectedDocument.issuedOn),
    total: formatAmountInput(rejectedDocument.total),
    buyerKind: buyer.kind === "cuit" ? "cuit" : "final_consumer",
    buyerCuit: buyer.kind === "cuit" ? String(buyer.number) : "",
    buyerTaxStatusCode: String(rejectedDocument.buyerTaxStatusCode),
  };
}

function wholeNumberOf(typed: string): number {
  const digits = typed.replaceAll(/[-\s]/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : Number.NaN;
}

type Correction = Extract<RejectedDocumentRemedyBody["remedy"], { kind: "printed" }>["correction"];

type ChosenBuyer = NonNullable<Correction["buyer"]>;

function chosenBuyerOf({ buyerKind, buyerCuit }: RemedyFormValues): ChosenBuyer {
  return buyerKind === "cuit"
    ? { kind: "cuit", number: wholeNumberOf(buyerCuit) }
    : { kind: "final_consumer" };
}

function isPresentedBuyer(chosen: ChosenBuyer, presented: PresentedValues["buyer"]): boolean {
  if (chosen.kind === "cuit") {
    return presented.kind === "cuit" && presented.number === chosen.number;
  }
  return presented.kind === chosen.kind;
}

function correctionFrom(values: RemedyFormValues): Correction {
  const { presented } = values;
  const total = parseAmountCents(values.total) ?? Number.NaN;
  const buyer = chosenBuyerOf(values);
  const buyerTaxStatusCode = wholeNumberOf(values.buyerTaxStatusCode);
  const issuedOn = values.issuedOn?.toString();
  return {
    ...(issuedOn !== undefined && issuedOn !== presented.issuedOn ? { issued_on: issuedOn } : {}),
    ...(total !== presented.total ? { total } : {}),
    ...(isPresentedBuyer(buyer, presented.buyer) ? {} : { buyer }),
    ...(buyerTaxStatusCode !== presented.buyerTaxStatusCode
      ? { buyer_tax_status_code: buyerTaxStatusCode }
      : {}),
  };
}

export function remedyRequestFrom(values: RemedyFormValues): RejectedDocumentRemedyBody {
  return {
    point_of_sale_number: values.pointOfSaleNumber,
    fortnight_start: values.fortnightStart,
    document_type: "factura_c",
    number: values.number,
    remedy:
      values.errorIn === "report"
        ? { kind: "report" }
        : { kind: "printed", correction: correctionFrom(values) },
  };
}

export function issuedOnMessage(): string {
  return "Revisá la fecha.";
}

export function totalMessage({ total }: RemedyFormValues): string {
  if (total.trim() === "") {
    return "Ingresá el total del comprobante.";
  }
  return parseAmountCents(total) === undefined
    ? "Escribí el total con coma para los decimales, por ejemplo 7.500,50."
    : "Revisá el total.";
}

export function buyerCuitMessage({ buyerCuit }: RemedyFormValues): string {
  if (buyerCuit.trim() === "") {
    return "Ingresá el CUIT del comprador.";
  }
  return Number.isNaN(wholeNumberOf(buyerCuit))
    ? "Escribí el CUIT solo con números."
    : "Revisá el CUIT.";
}

export function buyerTaxStatusCodeMessage(): string {
  return "Elegí la condición frente al IVA.";
}

type TaxStatusOption = { value: string; label: string };

export function buyerTaxStatusOptions(
  statuses: readonly BuyerTaxStatus[],
  presentedCode: number,
): readonly [TaxStatusOption, ...TaxStatusOption[]] {
  const printed: TaxStatusOption = {
    value: String(presentedCode),
    label: `Código ${presentedCode}`,
  };
  const listed = statuses.map(({ code, description }) => ({
    value: String(code),
    label: description,
  }));
  const [first = printed, ...rest] = statuses.some(({ code }) => code === presentedCode)
    ? listed
    : [printed, ...listed];
  return [first, ...rest];
}

export function correctionRefusalMessage(
  refusal: CorrectionRefusal,
  fortnight: { start: string; end: string },
): string {
  switch (refusal) {
    case "date_outside_fortnight":
      return `Elegí una fecha dentro de la quincena ${formatCalendarDayRange(fortnight.start, fortnight.end)}.`;
    case "date_out_of_order":
      return "La fecha no puede ser anterior a la del comprobante que le precede ni posterior a la del que le sigue.";
    case "invalid_total":
      return "El total tiene que ser un importe mayor a cero.";
    case "invalid_buyer_identification":
      return "Revisá el documento del comprador y su condición frente al IVA.";
    case "nothing_changed":
      return "No cambiaste ningún dato del comprobante.";
  }
}

export function correctionRefusalField(
  refusal: CorrectionRefusal,
  { buyerKind }: RemedyFormValues,
): "issuedOn" | "total" | "buyerCuit" | "buyerTaxStatusCode" | null {
  switch (refusal) {
    case "date_outside_fortnight":
    case "date_out_of_order":
      return "issuedOn";
    case "invalid_total":
      return "total";
    case "invalid_buyer_identification":
      return buyerKind === "cuit" ? "buyerCuit" : "buyerTaxStatusCode";
    case "nothing_changed":
      return null;
  }
}

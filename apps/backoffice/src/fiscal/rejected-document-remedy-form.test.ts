import { parseDate } from "@internationalized/date";
import { rejectedDocumentRemedyBodySchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import type { RejectedDocument } from "./fortnight-presentations-api";
import {
  buyerCuitMessage,
  buyerTaxStatusCodeMessage,
  buyerTaxStatusOptions,
  correctionRefusalField,
  correctionRefusalMessage,
  issuedOnMessage,
  type RemedyFormValues,
  remedyFormValuesFrom,
  remedyRequestFrom,
  totalMessage,
} from "./rejected-document-remedy-form";

const fortnight = { start: "2026-09-01", end: "2026-09-15" };

const rejectedDocument: RejectedDocument = {
  number: 298,
  unprocessed: 12,
  issuedOn: "2026-09-09",
  total: 1_845_000,
  buyer: { kind: "final_consumer" },
  buyerTaxStatusCode: 5,
  rejections: [{ code: 10016, message: "Fictional observation" }],
  remedy: "awaiting_remedy",
};

const target = { pointOfSaleNumber: 4, fortnight, rejectedDocument };

function valuesWith(overrides: Partial<RemedyFormValues> = {}): RemedyFormValues {
  return { ...remedyFormValuesFrom(target), ...overrides };
}

test("starts on the error being in the report, with the printed values of the document ready to correct", () => {
  expect(remedyFormValuesFrom(target)).toMatchObject({
    errorIn: "report",
    issuedOn: parseDate("2026-09-09"),
    total: "18.450,00",
    buyerKind: "final_consumer",
    buyerCuit: "",
    buyerTaxStatusCode: "5",
  });
});

const soldWithCuit = {
  ...target,
  rejectedDocument: {
    ...rejectedDocument,
    buyer: { kind: "cuit", number: 20_000_000_001 },
    buyerTaxStatusCode: 1,
  },
} as const;

test("starts a document sold to a company with its CUIT typed", () => {
  expect(remedyFormValuesFrom(soldWithCuit)).toMatchObject({
    buyerKind: "cuit",
    buyerCuit: "20000000001",
  });
});

test("starts a document whose buyer is neither a final consumer nor a CUIT on a final consumer, with no CUIT typed", () => {
  const values = remedyFormValuesFrom({
    ...target,
    rejectedDocument: { ...rejectedDocument, buyer: { kind: "other" } },
  });

  expect(values).toMatchObject({ buyerKind: "final_consumer", buyerCuit: "" });
  expect(remedyRequestFrom({ ...values, errorIn: "printed" }).remedy).toEqual({
    kind: "printed",
    correction: { buyer: { kind: "final_consumer" } },
  });
});

test("asks for the document to be reported as presented when the error is in the report", () => {
  const request = remedyRequestFrom(valuesWith());

  expect(request).toEqual({
    point_of_sale_number: 4,
    fortnight_start: "2026-09-01",
    document_type: "factura_c",
    number: 298,
    remedy: { kind: "report" },
  });
  expect(rejectedDocumentRemedyBodySchema.safeParse(request).success).toBe(true);
});

test("asks to correct only what changed from the printed document when the error is in the printed one", () => {
  const request = remedyRequestFrom(
    valuesWith({ errorIn: "printed", issuedOn: parseDate("2026-09-10"), total: "18.000,50" }),
  );

  expect(request.remedy).toEqual({
    kind: "printed",
    correction: { issued_on: "2026-09-10", total: 1_800_050 },
  });
  expect(rejectedDocumentRemedyBodySchema.safeParse(request).success).toBe(true);
});

test("asks to correct the buyer as one with the typed CUIT and the chosen tax status code", () => {
  const request = remedyRequestFrom(
    valuesWith({
      errorIn: "printed",
      buyerKind: "cuit",
      buyerCuit: "20-00000000-1",
      buyerTaxStatusCode: "1",
    }),
  );

  expect(request.remedy).toEqual({
    kind: "printed",
    correction: {
      buyer: { kind: "cuit", number: 20_000_000_001 },
      buyer_tax_status_code: 1,
    },
  });
  expect(rejectedDocumentRemedyBodySchema.safeParse(request).success).toBe(true);
});

test("asks to correct a buyer printed with a CUIT as a final consumer", () => {
  const values = remedyFormValuesFrom(soldWithCuit);

  expect(
    remedyRequestFrom({ ...values, errorIn: "printed", buyerKind: "final_consumer" }).remedy,
  ).toEqual({ kind: "printed", correction: { buyer: { kind: "final_consumer" } } });
});

test("asks for no change of the buyer while the CUIT typed is the printed one, and for one once it differs", () => {
  const values = { ...remedyFormValuesFrom(soldWithCuit), errorIn: "printed" } as const;

  expect(remedyRequestFrom({ ...values, buyerCuit: "20-00000000-1" }).remedy).toEqual({
    kind: "printed",
    correction: {},
  });
  expect(remedyRequestFrom({ ...values, buyerCuit: "23-00000000-0" }).remedy).toEqual({
    kind: "printed",
    correction: { buyer: { kind: "cuit", number: 23_000_000_000 } },
  });
});

test("a correction that changes nothing asks for no field, so the cloud refuses it", () => {
  expect(remedyRequestFrom(valuesWith({ errorIn: "printed" })).remedy).toEqual({
    kind: "printed",
    correction: {},
  });
});

test("a cleared date asks for no change of the date", () => {
  expect(
    remedyRequestFrom(valuesWith({ errorIn: "printed", issuedOn: null, total: "1,00" })).remedy,
  ).toEqual({ kind: "printed", correction: { total: 100 } });
});

test.each([
  ["no total", { total: "" }, ["total"]],
  ["a total that is not an amount", { total: "mucho" }, ["total"]],
  ["no CUIT for a company", { buyerKind: "cuit", buyerCuit: "" }, ["buyer", "number"]],
  ["a CUIT with letters", { buyerKind: "cuit", buyerCuit: "20-abc" }, ["buyer", "number"]],
  ["no tax status code", { buyerTaxStatusCode: "" }, ["buyer_tax_status_code"]],
  ["a tax status code with letters", { buyerTaxStatusCode: "cinco" }, ["buyer_tax_status_code"]],
] as const)(
  "a printed correction with %s is refused by the contract, naming the field",
  (_case, overrides, field) => {
    const result = rejectedDocumentRemedyBodySchema.safeParse(
      remedyRequestFrom(valuesWith({ errorIn: "printed", ...overrides })),
    );

    expect(result.error?.issues[0]?.path).toEqual(["remedy", "correction", ...field]);
  },
);

test.each([
  { total: "", reason: "Ingresá el total del comprobante." },
  {
    total: "12.50",
    reason: "Escribí el total con coma para los decimales, por ejemplo 7.500,50.",
  },
  { total: "100,00", reason: "Revisá el total." },
])("a typed total of '$total' can't be sent: $reason", ({ total, reason }) => {
  expect(totalMessage(valuesWith({ total }))).toBe(reason);
});

test.each([
  { buyerCuit: "", reason: "Ingresá el CUIT del comprador." },
  { buyerCuit: "20-abc", reason: "Escribí el CUIT solo con números." },
  { buyerCuit: "20-00000000-2", reason: "Revisá el CUIT." },
])("a typed CUIT of '$buyerCuit' can't be sent: $reason", ({ buyerCuit, reason }) => {
  expect(buyerCuitMessage(valuesWith({ buyerCuit }))).toBe(reason);
});

test("asks to choose the tax status", () => {
  expect(buyerTaxStatusCodeMessage()).toBe("Elegí la condición frente al IVA.");
});

const statuses = [
  { code: 5, description: "Consumidor Final" },
  { code: 1, description: "IVA Responsable Inscripto" },
];

test("offers the descriptions of the statuses, valued by their code", () => {
  expect(buyerTaxStatusOptions(statuses, 5)).toEqual([
    { value: "5", label: "Consumidor Final" },
    { value: "1", label: "IVA Responsable Inscripto" },
  ]);
});

test("offers a code that was printed but is not in the set as its code, first", () => {
  expect(buyerTaxStatusOptions(statuses, 7)).toEqual([
    { value: "7", label: "Código 7" },
    { value: "5", label: "Consumidor Final" },
    { value: "1", label: "IVA Responsable Inscripto" },
  ]);
});

test("asks to review the date the cloud refuses", () => {
  expect(issuedOnMessage()).toBe("Revisá la fecha.");
});

test.each([
  ["date_outside_fortnight", "Elegí una fecha dentro de la quincena del 1 al 15 de septiembre."],
  [
    "date_out_of_order",
    "La fecha no puede ser anterior a la del comprobante que le precede ni posterior a la del que le sigue.",
  ],
  ["invalid_total", "El total tiene que ser un importe mayor a cero."],
  [
    "invalid_buyer_identification",
    "Revisá el documento del comprador y su condición frente al IVA.",
  ],
  ["nothing_changed", "No cambiaste ningún dato del comprobante."],
] as const)("tells the person a correction refused as %s: %s", (refusal, message) => {
  expect(correctionRefusalMessage(refusal, fortnight)).toBe(message);
});

test.each([
  ["date_outside_fortnight", valuesWith(), "issuedOn"],
  ["date_out_of_order", valuesWith(), "issuedOn"],
  ["invalid_total", valuesWith(), "total"],
  ["invalid_buyer_identification", valuesWith({ buyerKind: "cuit" }), "buyerCuit"],
  ["invalid_buyer_identification", valuesWith(), "buyerTaxStatusCode"],
  ["nothing_changed", valuesWith(), null],
] as const)("shows the refusal %s on the field %s", (refusal, values, field) => {
  expect(correctionRefusalField(refusal, values)).toBe(field);
});

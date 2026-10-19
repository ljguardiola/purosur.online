import type { CreditNoteCFiscalBlock } from "@purosur/domain";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { printoutOf } from "../test-support/escpos-printout";
import { type CreditNoteReceiptContent, escPosCreditNoteTemplate } from "./escpos-receipt-template";

const RULE = "─".repeat(48);
const QR_TEXT = "https://www.arca.gob.ar/fe/qr/?p=eyJ0aXBvQ21wIjoxM30=";

const FISCAL_BLOCK: CreditNoteCFiscalBlock = {
  invoiceClass: "C",
  voucherTypeCode: 13,
  issuer: {
    legalName: FICTIONAL_LEGAL_NAME,
    cuit: FICTIONAL_CUIT,
    taxStatus: "Responsable Monotributo",
    grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
    activityStartDate: "2020-01-15",
  },
  buyerTaxStatusDescription: "Consumidor Final",
  pointOfSale: 12,
  number: 7,
  authorizationCode: "71234567890999",
  authorizationCodeDueOn: "2026-10-12",
  corrects: { voucherType: 11, pointOfSale: 12, number: 123 },
  qrText: QR_TEXT,
};

function creditNote(overrides: Partial<CreditNoteReceiptContent> = {}): CreditNoteReceiptContent {
  return {
    header: {
      address: "Av. Belgrano 1450",
      whatsappNumber: "11 5555-0100",
      instagramHandle: "@puro.sur",
    },
    operation: {
      occurredAt: new Date("2026-10-02T15:30:00.000Z"),
      servedByFirstName: "Ada",
      operationNumber: 482,
    },
    issuedOn: "2026-10-02",
    lines: [
      {
        productName: "Alfajor",
        saleUnit: "UNIT",
        quantity: 2,
        listUnitPrice: 420_000,
        chargedUnitPrice: 420_000,
        manualAdjustment: null,
        promotion: { name: "Promo 20% en la segunda" },
        discountAmount: 84_000,
        lineTotal: 756_000,
      },
      {
        productName: "Café molido 250 g",
        saleUnit: "UNIT",
        quantity: 1,
        listUnitPrice: 350_000,
        chargedUnitPrice: 350_000,
        manualAdjustment: null,
        promotion: null,
        discountAmount: 0,
        lineTotal: 350_000,
      },
    ],
    totals: {
      subtotal: 1_106_000,
      saleDiscount: { kind: "PERCENT", percent: 10, amount: 110_600 },
      total: 995_400,
    },
    refunds: [
      { method: "CASH", amount: 495_400 },
      { method: "TRANSFER", amount: 500_000 },
    ],
    fiscal: FISCAL_BLOCK,
    ...overrides,
  };
}

function printed(content: CreditNoteReceiptContent) {
  return printoutOf(escPosCreditNoteTemplate.render(content));
}

const HEAD = [
  "[init]",
  "[codepage PC850]",
  "[feed dots 24]",
  "[logo 576x280]",
  "[feed dots 16]",
  "[small]                       Av. Belgrano 1450[/small]",
  "[small]              WhatsApp 11 5555-0100  ·  @puro.sur[/small]",
  RULE,
  "[bold]               NOTA DE CRÉDITO C[/bold]",
  "[small]                Cód. 013  ·  A consumidor final[/small]",
];

const OPERATION = [
  RULE,
  "Punto de venta 00012                 Nº 00000007",
  "Fecha 02/10/2026                      Hora 12:30",
  "Operación 000482                     Atendió Ada",
  "Asociada a Factura C             00012-00000123",
  RULE,
  "[small]Comercio de Prueba                       Responsable Monotributo[/small]",
  "[small]CUIT 20-00000000-1                          IIBB CM 000-000000-0[/small]",
  "[small]Inicio de actividades 15/01/2020[/small]",
  RULE,
];

const VOIDED_SALE = [
  "[bold]PRODUCTO                                 IMPORTE[/bold]",
  "Alfajor",
  "  2 x $ 4.200,00                      $ 8.400,00",
  "  Promo 20% en la segunda              -$ 840,00",
  "Café molido 250 g                     $ 3.500,00",
  RULE,
  "Subtotal                             $ 11.060,00",
  "Descuento sobre el total 10%         -$ 1.106,00",
  RULE,
  "[bold]TOTAL                                 $ 9.954,00[/bold]",
  RULE,
  "Reintegro en efectivo                 $ 4.954,00",
  "Reintegro por transferencia           $ 5.000,00",
];

const AUTHORIZATION = [
  "[feed dots 16]",
  "[align center]",
  "[qr model 2]",
  "[qr module 12]",
  "[qr correction L]",
  `[qr store ${QR_TEXT}]`,
  "[qr print]",
  "[align left]",
  "[feed dots 8]",
  "[small]                     Comprobante autorizado[/small]",
  "[small]             CAE 71234567890999  ·  Vto. 12/10/2026[/small]",
];

const CLOSING = [
  RULE,
  "[bold]             Gracias por tu compra[/bold]",
  "[small]          Cambios y devoluciones solo con este ticket.[/small]",
  "[feed 5]",
  "[cut partial]",
];

describe("the ESC/POS credit note of a voided sale", () => {
  it("lays out the voucher, the invoice it corrects, the voided lines, each refund and its authorization", () => {
    expect(printed(creditNote()).text).toBe(
      [...HEAD, ...OPERATION, ...VOIDED_SALE, ...AUTHORIZATION, ...CLOSING].join("\n"),
    );
  });

  it("leaves out the discount line of a sale without a discount on its total", () => {
    const content = creditNote({
      totals: { subtotal: 1_106_000, saleDiscount: null, total: 1_106_000 },
      refunds: [{ method: "CASH", amount: 1_106_000 }],
    });

    const { textLines } = printed(content);

    expect(textLines.some((line) => line.startsWith("Descuento sobre el total"))).toBe(false);
    expect(textLines).toContain("Reintegro en efectivo                $ 11.060,00");
  });

  it.each([
    ["QR", "Reintegro por QR de Mercado Pago"],
    ["POINT", "Reintegro por Point integrada"],
    ["STANDALONE_TERMINAL", "Reintegro por terminal independiente"],
  ] as const)("names the refund of a %s payment", (method, name) => {
    const { textLines } = printed(creditNote({ refunds: [{ method, amount: 995_400 }] }));

    expect(textLines.some((line) => line.startsWith(name))).toBe(true);
  });

  it("dates the voucher with the day the tax authority issued it and the hour of the void", () => {
    const { textLines } = printed(
      creditNote({
        issuedOn: "2026-10-03",
        operation: {
          occurredAt: new Date("2026-10-03T02:59:00.000Z"),
          servedByFirstName: "Ada",
          operationNumber: 482,
        },
      }),
    );

    expect(textLines).toContain("Fecha 03/10/2026                      Hora 23:59");
  });

  it("stays within the width of the paper", () => {
    const content = creditNote({
      header: {
        address:
          "Avenida Presidente Julio Argentino Roca 1450, Piso 12, Oficina 7, Ciudad de Buenos Aires",
        whatsappNumber: "11 5555-0100",
        instagramHandle: "@puro.sur",
      },
    });

    expect(printed(content).rows.every(({ text, small }) => text.length <= (small ? 64 : 48))).toBe(
      true,
    );
  });
});

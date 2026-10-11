import type { FacturaCFiscalBlock, ReceiptContent, ReceiptCopy } from "@purosur/domain";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import type { StoredReceipt } from "@purosur/domain/sales/use-cases";
import { describe, expect, it } from "vitest";
import { escPosReceiptTemplate } from "./escpos-receipt-template";
import { printoutOf } from "./test-support/escpos-printout";

const RULE = "─".repeat(48);
const ORIGINAL: ReceiptCopy = { kind: "original" };

function receipt(overrides: Partial<ReceiptContent> = {}): ReceiptContent {
  return {
    header: {
      address: "Av. Belgrano 1450",
      whatsappNumber: "11 5555-0100",
      instagramHandle: "@puro.sur",
    },
    operation: {
      occurredAt: new Date("2026-09-30T15:05:00.000Z"),
      servedByFirstName: "Ada",
      operationNumber: 482,
    },
    lines: [
      {
        productName: "Yerba a granel",
        saleUnit: "KG",
        quantity: 350,
        listUnitPrice: 1_890_000,
        chargedUnitPrice: 1_890_000,
        manualAdjustment: null,
        promotion: null,
        discountAmount: 0,
        lineTotal: 661_500,
      },
      {
        productName: "Alfajor",
        saleUnit: "UNIT",
        quantity: 2,
        listUnitPrice: 420_000,
        chargedUnitPrice: 420_000,
        manualAdjustment: null,
        promotion: { kind: "PERCENT_OFF", percent: 10 },
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
      subtotal: 1_767_500,
      total: 1_767_500,
      payments: [
        { method: "CASH", amount: 1_000_000 },
        { method: "TRANSFER", amount: 767_500 },
      ],
      change: 500_000,
    },
    fiscal: null,
    ...overrides,
  };
}

function singleUnitReceipt(productName: string, price: number): ReceiptContent {
  return receipt({
    lines: [
      {
        productName,
        saleUnit: "UNIT",
        quantity: 1,
        listUnitPrice: price,
        chargedUnitPrice: price,
        manualAdjustment: null,
        promotion: null,
        discountAmount: 0,
        lineTotal: price,
      },
    ],
    totals: {
      subtotal: price,
      total: price,
      payments: [{ method: "TRANSFER", amount: price }],
      change: 0,
    },
    fiscal: null,
  });
}

function printed(content: ReceiptContent, copy: ReceiptCopy = ORIGINAL) {
  const stored = escPosReceiptTemplate.render(content);
  return printoutOf(escPosReceiptTemplate.printable(stored, copy));
}

const HEAD = [
  "[init]",
  "[codepage PC850]",
  "[logo 384x200]",
  "[small]                       Av. Belgrano 1450[/small]",
  "[small]              WhatsApp 11 5555-0100  ·  @puro.sur[/small]",
];

const OPERATION = [
  "Fecha 30/09/2026                      Hora 12:05",
  "Operación 000482                     Atendió Ada",
  RULE,
];

const SALE_OF_MIXED_SALE = [
  "[bold]PRODUCTO                                 IMPORTE[/bold]",
  "Yerba a granel",
  "  0,350 kg x $ 18.900,00 el kg        $ 6.615,00",
  "Alfajor",
  "  2 x $ 4.200,00                      $ 8.400,00",
  "  10 % de descuento                    -$ 840,00",
  "Café molido 250 g                     $ 3.500,00",
  RULE,
  "Subtotal                             $ 17.675,00",
  RULE,
  "[bold]TOTAL                                $ 17.675,00[/bold]",
  RULE,
  "Efectivo                             $ 10.000,00",
  "Transferencia                         $ 7.675,00",
  "Vuelto                                $ 5.000,00",
];

const CLOSING = [
  RULE,
  "[bold]             Gracias por tu compra[/bold]",
  "[small]          Cambios y devoluciones solo con este ticket.[/small]",
  "[feed 5]",
  "[cut partial]",
];

const BODY_OF_MIXED_SALE = [RULE, ...OPERATION, ...SALE_OF_MIXED_SALE, ...CLOSING];

const QR_DATA = {
  ver: 1,
  fecha: "2026-09-30",
  cuit: 20000000001,
  ptoVta: 1,
  tipoCmp: 11,
  nroCmp: 123,
  importe: 17675,
  moneda: "PES",
  ctz: 1,
  tipoDocRec: 99,
  nroDocRec: 0,
  tipoCodAut: "E",
  codAut: 71234567890123,
};
const QR_URL = "https://www.arca.gob.ar/fe/qr/?p=";
const QR_TEXT = QR_URL + btoa(JSON.stringify(QR_DATA));
const FISCAL_BLOCK: FacturaCFiscalBlock = {
  invoiceClass: "C",
  voucherTypeCode: 11,
  issuer: {
    legalName: FICTIONAL_LEGAL_NAME,
    cuit: FICTIONAL_CUIT,
    taxStatus: "Responsable Monotributo",
    grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
    activityStartDate: "2020-01-15",
  },
  buyerTaxStatusDescription: "Consumidor Final",
  pointOfSale: 1,
  number: 123,
  total: 1_767_500,
  authorizationCode: "71234567890123",
  authorizationCodeDueOn: "2026-10-10",
  qrText: QR_TEXT,
};

const FISCAL_HEAD = [
  ...HEAD,
  RULE,
  "[bold]                   FACTURA C[/bold]",
  "[small]                Cód. 011  ·  A consumidor final[/small]",
];

const FISCAL_BODY = [
  RULE,
  "Punto de venta 00001                 Nº 00000123",
  ...OPERATION,
  "[small]Comercio de Prueba                       Responsable Monotributo[/small]",
  "[small]CUIT 20-00000000-1                          IIBB CM 000-000000-0[/small]",
  "[small]Inicio de actividades 15/01/2020[/small]",
  RULE,
  ...SALE_OF_MIXED_SALE,
  "[align center]",
  "[qr model 2]",
  "[qr module 4]",
  "[qr correction M]",
  `[qr store ${QR_TEXT}]`,
  "[qr print]",
  "[align left]",
  "[small]                     Comprobante autorizado[/small]",
  "[small]             CAE 71234567890123  ·  Vto. 10/10/2026[/small]",
  ...CLOSING,
];

function rowsWithinThePaper(content: ReceiptContent, copy: ReceiptCopy = ORIGINAL): boolean {
  return printed(content, copy).rows.every(({ text, small }) => text.length <= (small ? 64 : 48));
}

describe("the ESC/POS receipt template", () => {
  it("renders the original receipt of a sale with a weighed line, a promotion and two payments", () => {
    expect(printed(receipt()).text).toBe([...HEAD, ...BODY_OF_MIXED_SALE].join("\n"));
  });

  it("puts the duplicate legend right below the store's header", () => {
    expect(printed(receipt(), { kind: "duplicate", orderNumber: 2 }).text).toBe(
      [...HEAD, "[bold]              COPIA DUPLICADA Nº 2[/bold]", ...BODY_OF_MIXED_SALE].join(
        "\n",
      ),
    );
  });

  it("prints a unit line of quantity one on a single row and leaves out the change of a sale paid by transfer only", () => {
    expect(printed(singleUnitReceipt("Alfajor", 420_000)).text).toBe(
      [
        ...HEAD,
        RULE,
        ...OPERATION,
        "[bold]PRODUCTO                                 IMPORTE[/bold]",
        "Alfajor                               $ 4.200,00",
        RULE,
        "Subtotal                              $ 4.200,00",
        RULE,
        "[bold]TOTAL                                 $ 4.200,00[/bold]",
        RULE,
        "Transferencia                         $ 4.200,00",
        ...CLOSING,
      ].join("\n"),
    );
  });

  it("adds the promotion of a unit line of quantity one on its own row", () => {
    const { textLines } = printed(
      receipt({
        lines: [
          {
            productName: "Café molido 250 g",
            saleUnit: "UNIT",
            quantity: 1,
            listUnitPrice: 350_000,
            chargedUnitPrice: 350_000,
            manualAdjustment: null,
            promotion: { kind: "PERCENT_OFF", percent: 10 },
            discountAmount: 35_000,
            lineTotal: 315_000,
          },
        ],
      }),
    );

    expect(textLines).toContain("Café molido 250 g                     $ 3.500,00");
    expect(textLines).toContain("  10 % de descuento                    -$ 350,00");
  });

  it("prints the weight and the price per kilo of a weighed line, even of one kilo", () => {
    const { textLines } = printed(
      receipt({
        lines: [
          {
            productName: "Yerba a granel",
            saleUnit: "KG",
            quantity: 1_000,
            listUnitPrice: 1_890_000,
            chargedUnitPrice: 1_890_000,
            manualAdjustment: null,
            promotion: null,
            discountAmount: 0,
            lineTotal: 1_890_000,
          },
        ],
      }),
    );

    expect(textLines).toContain("Yerba a granel");
    expect(textLines).toContain("  1,000 kg x $ 18.900,00 el kg       $ 18.900,00");
  });

  it("names a payment by Mercado Pago QR, aligned with the other payment lines", () => {
    const { textLines } = printed(
      receipt({
        totals: {
          subtotal: 1_767_500,
          total: 1_767_500,
          payments: [
            { method: "CASH", amount: 767_500 },
            { method: "QR", amount: 1_000_000 },
          ],
          change: 0,
        },
      }),
    );

    expect(textLines).toContain("Efectivo                              $ 7.675,00");
    expect(textLines).toContain("QR Mercado Pago                      $ 10.000,00");
  });

  it("wraps a long product name beside its amount within the columns of the paper", () => {
    const { textLines } = printed(
      singleUnitReceipt(
        "Aceite de oliva extra virgen orgánico primera prensada en frío 500 ml",
        980_000,
      ),
    );

    expect(textLines).toContain("Aceite de oliva extra virgen orgánico");
    expect(textLines).toContain("primera prensada en frío 500 ml       $ 9.800,00");
  });

  it("breaks a word longer than the columns left", () => {
    const { textLines } = printed(singleUnitReceipt("A".repeat(60), 980_000));

    expect(textLines).toContain("A".repeat(37));
    expect(textLines).toContain("AAAAAAAAAAAAAAAAAAAAAAA               $ 9.800,00");
  });

  it("writes the operation number with six digits, however small or large", () => {
    const written = (operationNumber: number) =>
      printed(
        receipt({
          operation: {
            occurredAt: new Date("2026-09-30T15:05:00.000Z"),
            servedByFirstName: "Ada",
            operationNumber,
          },
        }),
      ).textLines;

    expect(written(1)).toContain("Operación 000001                     Atendió Ada");
    expect(written(1_234_567)).toContain("Operación 1234567                    Atendió Ada");
  });

  it("writes the moment of the sale in Argentina's time", () => {
    const { textLines } = printed(
      receipt({
        operation: {
          occurredAt: new Date("2026-10-01T02:30:00.000Z"),
          servedByFirstName: "Ada",
          operationNumber: 482,
        },
      }),
    );

    expect(textLines).toContain("Fecha 30/09/2026                      Hora 23:30");
  });

  it("shows a buy-and-pay promotion by what it asks and what it charges, with no line total", () => {
    const { textLines } = printed(
      receipt({
        lines: [
          {
            productName: "Alfajor",
            saleUnit: "UNIT",
            quantity: 3,
            listUnitPrice: 420_000,
            chargedUnitPrice: 420_000,
            manualAdjustment: null,
            promotion: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
            discountAmount: 420_000,
            lineTotal: 840_000,
          },
        ],
      }),
    );

    expect(textLines).toEqual(
      expect.arrayContaining([
        "Alfajor",
        "  3 x $ 4.200,00                     $ 12.600,00",
        "  Lleve 3, pague 2                   -$ 4.200,00",
        RULE,
      ]),
    );
    expect(textLines.join("\n")).not.toContain("Total de la línea");
  });

  it("shows the unit price charged, not the list price, for a line whose price was overridden", () => {
    const { textLines } = printed(
      receipt({
        lines: [
          {
            productName: "Alfajor",
            saleUnit: "UNIT",
            quantity: 3,
            listUnitPrice: 420_000,
            chargedUnitPrice: 300_000,
            manualAdjustment: { kind: "PRICE", unitPrice: 300_000 },
            promotion: null,
            discountAmount: 0,
            lineTotal: 900_000,
          },
        ],
      }),
    );

    expect(textLines).toContain("  3 x $ 3.000,00                      $ 9.000,00");
  });

  it("shows the weight at the unit price charged for a line sold by weight whose price was overridden", () => {
    const { textLines } = printed(
      receipt({
        lines: [
          {
            productName: "Yerba a granel",
            saleUnit: "KG",
            quantity: 500,
            listUnitPrice: 1_890_000,
            chargedUnitPrice: 1_600_000,
            manualAdjustment: { kind: "PRICE", unitPrice: 1_600_000 },
            promotion: null,
            discountAmount: 0,
            lineTotal: 800_000,
          },
        ],
      }),
    );

    expect(textLines).toContain("  0,500 kg x $ 16.000,00 el kg        $ 8.000,00");
  });

  it("prints no row wider than the paper, 48 columns in the regular font and 64 in the small one", () => {
    const sales = [
      receipt(),
      receipt({
        header: {
          address: "Avenida Presidente Hipólito Yrigoyen 14500, Carmen de Patagones, Buenos Aires",
          whatsappNumber: "+54 9 2920 55-0100",
          instagramHandle: "@puro.sur.almacen.natural",
        },
      }),
      singleUnitReceipt("A".repeat(60), 980_000),
      singleUnitReceipt("Aceite de oliva extra virgen orgánico primera prensada en frío", 980_000),
    ];
    for (const sale of sales) {
      for (const copy of [ORIGINAL, { kind: "duplicate", orderNumber: 12 } as const]) {
        expect(rowsWithinThePaper(sale, copy)).toBe(true);
      }
    }
  });

  it("writes Spanish letters and signs as their bytes of the PC850 code page", () => {
    const stored = escPosReceiptTemplate.render(
      singleUnitReceipt("Ñandú ¿ü? ¡ºá é í ó ú ñ!·", 100),
    );
    const bytes = Array.from(stored.body);

    expect(bytes).toEqual(expect.arrayContaining([0xa5, 0xa3, 0xa8, 0x81, 0xad, 0xa7, 0xa0]));
    expect(bytes.slice(bytes.indexOf(0xa5), bytes.indexOf(0xa5) + 5)).toEqual([
      0xa5, 0x61, 0x6e, 0x64, 0xa3,
    ]);
  });

  it("starts the head by initializing the printer and choosing the PC850 code page", () => {
    const { head } = escPosReceiptTemplate.render(receipt());

    expect(Array.from(head.slice(0, 5))).toEqual([0x1b, 0x40, 0x1b, 0x74, 0x02]);
  });

  it("prints the small rows in the printer's second font and goes back to the first one", () => {
    const { head } = escPosReceiptTemplate.render(receipt());
    const bytes = Array.from(head);
    const small = bytes.indexOf(0x4d);

    expect(bytes.slice(small - 1, small + 2)).toEqual([0x1b, 0x4d, 0x01]);
    expect(bytes.slice(-4)).toEqual([0x1b, 0x4d, 0x00, 0x0a]);
  });

  it("feeds blank paper past the cutter before cutting at the end of the body", () => {
    const { body } = escPosReceiptTemplate.render(receipt());

    expect(Array.from(body.slice(-6))).toEqual([0x1b, 0x64, 0x05, 0x1d, 0x56, 0x01]);
  });

  it("renders the version of the template with the head and the body apart", () => {
    const stored = escPosReceiptTemplate.render(receipt());

    expect(stored.templateVersion).toBe("1");
    expect(printoutOf(stored.head).text).toBe(HEAD.join("\n"));
    expect(printoutOf(stored.body).text).toBe(BODY_OF_MIXED_SALE.join("\n"));
  });

  it("prints an original as exactly its head followed by its body", () => {
    const stored = escPosReceiptTemplate.render(receipt());

    expect(escPosReceiptTemplate.printable(stored, ORIGINAL)).toEqual(
      Uint8Array.from([...stored.head, ...stored.body]),
    );
  });

  it("prints a duplicate as its head, the legend and its body", () => {
    const stored = escPosReceiptTemplate.render(receipt());

    const duplicate = escPosReceiptTemplate.printable(stored, {
      kind: "duplicate",
      orderNumber: 3,
    });

    const start = stored.head.length;
    const end = duplicate.length - stored.body.length;
    expect(Array.from(duplicate.slice(0, start))).toEqual(Array.from(stored.head));
    expect(Array.from(duplicate.slice(end))).toEqual(Array.from(stored.body));
    expect(printoutOf(duplicate.slice(start, end)).text).toBe(
      "[bold]              COPIA DUPLICADA Nº 3[/bold]",
    );
    expect(Array.from(duplicate.slice(start, end))).toContain(0xa7);
  });

  it("refuses to print a receipt stored by a version of the template it does not know", () => {
    const stored: StoredReceipt = {
      templateVersion: "2",
      head: new Uint8Array(),
      body: new Uint8Array(),
    };

    expect(() =>
      escPosReceiptTemplate.printable(stored, { kind: "duplicate", orderNumber: 1 }),
    ).toThrow(/2/);
  });

  describe("an authorized factura C", () => {
    const fiscalReceipt = () => receipt({ fiscal: FISCAL_BLOCK });

    it("lays out the voucher's type at the top, its number and issuer before the products, and its authorization after the payments", () => {
      expect(printed(fiscalReceipt()).text).toBe([...FISCAL_HEAD, ...FISCAL_BODY].join("\n"));
    });

    it("prints neither a net amount nor an IVA row", () => {
      const { textLines } = printed(fiscalReceipt());

      expect(textLines.some((line) => /Importe neto|IVA/.test(line))).toBe(false);
    });

    it("prints a QR whose text carries the voucher's data as the tax authority defines", () => {
      const store = printed(fiscalReceipt()).text.match(/\[qr store (.*)\]/)?.[1] ?? "";

      expect(store.startsWith(QR_URL)).toBe(true);
      expect(JSON.parse(atob(store.slice(QR_URL.length)))).toEqual(QR_DATA);
    });

    it("puts the duplicate legend right below the voucher's type", () => {
      const stored = escPosReceiptTemplate.render(fiscalReceipt());

      expect(printoutOf(stored.head).text).toBe(FISCAL_HEAD.join("\n"));
      expect(printoutOf(stored.body).text).toBe(FISCAL_BODY.join("\n"));
      expect(printed(fiscalReceipt(), { kind: "duplicate", orderNumber: 1 }).text).toBe(
        [...FISCAL_HEAD, "[bold]              COPIA DUPLICADA Nº 1[/bold]", ...FISCAL_BODY].join(
          "\n",
        ),
      );
    });

    it("prints no row wider than the paper, however long the issuer's and the buyer's data", () => {
      const longTaxStatus = {
        ...FISCAL_BLOCK,
        issuer: {
          ...FISCAL_BLOCK.issuer,
          taxStatus:
            "Responsable Monotributo del Régimen Simplificado para Pequeños Contribuyentes",
        },
      };
      const longLegalName = {
        ...FISCAL_BLOCK,
        issuer: {
          ...FISCAL_BLOCK.issuer,
          legalName: `${FICTIONAL_LEGAL_NAME} Sociedad de Responsabilidad Limitada del Sur`,
        },
      };
      const longBuyerTaxStatus = {
        ...FISCAL_BLOCK,
        buyerTaxStatusDescription:
          "Monotributista Trabajador Independiente Promovido del Régimen Simplificado",
      };
      for (const fiscal of [FISCAL_BLOCK, longTaxStatus, longLegalName, longBuyerTaxStatus]) {
        for (const copy of [ORIGINAL, { kind: "duplicate", orderNumber: 12 } as const]) {
          expect(rowsWithinThePaper(receipt({ fiscal }), copy)).toBe(true);
        }
      }
    });

    it("keeps the issuer's tax status beside its legal name when both fit", () => {
      const { textLines } = printed(fiscalReceipt());

      expect(textLines).toContain(
        "Comercio de Prueba                       Responsable Monotributo",
      );
    });
  });
});

import type { ReceiptContent, ReceiptCopy } from "@purosur/domain";
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
        promotion: null,
        discountAmount: 0,
        lineTotal: 661_500,
      },
      {
        productName: "Alfajor",
        saleUnit: "UNIT",
        quantity: 2,
        listUnitPrice: 420_000,
        promotion: { kind: "PERCENT_OFF", percent: 10 },
        discountAmount: 84_000,
        lineTotal: 756_000,
      },
      {
        productName: "Café molido 250 g",
        saleUnit: "UNIT",
        quantity: 1,
        listUnitPrice: 350_000,
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
  "               Av. Belgrano 1450",
  "      WhatsApp 11 5555-0100  ·  @puro.sur",
  RULE,
  "Fecha 30/09/2026                      Hora 12:05",
  "Operación 000482                     Atendió Ada",
  RULE,
];

const BODY_OF_MIXED_SALE = [
  "PRODUCTO                                 IMPORTE",
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
  RULE,
];

const CLOSING = [
  "             Gracias por tu compra",
  "  Cambios y devoluciones solo con este ticket.",
  "[feed 5]",
  "[cut partial]",
];

describe("the ESC/POS receipt template", () => {
  it("renders the original receipt of a sale with a weighed line, a promotion and two payments", () => {
    expect(printed(receipt()).text).toBe([...HEAD, ...BODY_OF_MIXED_SALE, ...CLOSING].join("\n"));
  });

  it("puts the duplicate legend between the head and the body of a duplicate", () => {
    expect(printed(receipt(), { kind: "duplicate", orderNumber: 2 }).text).toBe(
      [
        ...HEAD,
        "[bold]              COPIA DUPLICADA Nº 2[/bold]",
        ...BODY_OF_MIXED_SALE,
        ...CLOSING,
      ].join("\n"),
    );
  });

  it("leaves out the change of a sale paid by transfer only", () => {
    expect(printed(singleUnitReceipt("Alfajor", 420_000)).text).toBe(
      [
        ...HEAD,
        "PRODUCTO                                 IMPORTE",
        "Alfajor                               $ 4.200,00",
        RULE,
        "Subtotal                              $ 4.200,00",
        RULE,
        "[bold]TOTAL                                 $ 4.200,00[/bold]",
        RULE,
        "Transferencia                         $ 4.200,00",
        RULE,
        ...CLOSING,
      ].join("\n"),
    );
  });

  it("wraps a long product name within the columns left beside its amount", () => {
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
    expect(textLines).toContain(`${"A".repeat(23)}               $ 9.800,00`);
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

  it("shows a buy-and-pay promotion by what it asks and what it charges", () => {
    const { textLines } = printed(
      receipt({
        lines: [
          {
            productName: "Alfajor",
            saleUnit: "UNIT",
            quantity: 3,
            listUnitPrice: 420_000,
            promotion: { kind: "BUY_N_PAY_M", buyQty: 3, payQty: 2 },
            discountAmount: 420_000,
            lineTotal: 840_000,
          },
        ],
      }),
    );

    expect(textLines).toContain("  Lleve 3, pague 2                   -$ 4.200,00");
  });

  it("prints no line wider than the 48 columns of the paper", () => {
    const sales = [
      receipt(),
      singleUnitReceipt("A".repeat(60), 980_000),
      singleUnitReceipt("Aceite de oliva extra virgen orgánico primera prensada en frío", 980_000),
    ];
    for (const sale of sales) {
      for (const copy of [ORIGINAL, { kind: "duplicate", orderNumber: 12 } as const]) {
        for (const line of printed(sale, copy).textLines) {
          expect(line.length).toBeLessThanOrEqual(48);
        }
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

  it("feeds blank paper past the cutter before cutting at the end of the body", () => {
    const { body } = escPosReceiptTemplate.render(receipt());

    expect(Array.from(body.slice(-6))).toEqual([0x1b, 0x64, 0x05, 0x1d, 0x56, 0x01]);
  });

  it("renders the version of the template with the head and the body apart", () => {
    const stored = escPosReceiptTemplate.render(receipt());

    expect(stored.templateVersion).toBe("1");
    expect(printoutOf(stored.head).text).toBe(HEAD.join("\n"));
    expect(printoutOf(stored.body).text).toBe([...BODY_OF_MIXED_SALE, ...CLOSING].join("\n"));
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
});

import { describe, expect, it } from "vitest";
import type { SaleDetail } from "../shell/sale-receipt-text";
import { saleActionsOf } from "./sale-history-actions";
import { DETAIL } from "./test-support/sale-history-detail";

const AUTHORIZED_CREDIT_NOTE = {
  kind: "authorized",
  point_of_sale: 3,
  number: 21,
  issued_on: "2026-10-09",
  authorization_code: "75123456789012",
  authorization_code_due_on: "2026-10-19",
} as const;

const VOID_CREDIT_NOTE = {
  credit_note_id: "cn-1",
  origin: "sale_void",
  standing: AUTHORIZED_CREDIT_NOTE,
  next_copy: { kind: "duplicate", order_number: 1 },
} as const;

const VOIDED: SaleDetail = {
  ...DETAIL,
  state: "voided",
  voidability: { kind: "not_voidable", refusal: "not_completed" },
  credit_notes: [VOID_CREDIT_NOTE],
};

describe("saleActionsOf a completed sale", () => {
  it("reprints its receipt with F5 and voids it with Supr when the core says it is voidable", () => {
    const { entries, canVoid } = saleActionsOf(DETAIL);

    expect(entries).toEqual([
      {
        key: "F5",
        legend: "Reimprimir",
        label: "Reimprimir",
        primary: true,
        action: { kind: "reprint_receipt" },
      },
    ]);
    expect(canVoid).toBe(true);
  });

  it("prints the original receipt with F5 when the core says the next copy is the original", () => {
    const { entries } = saleActionsOf({ ...DETAIL, next_copy: { kind: "original" } });

    expect(entries).toEqual([
      {
        key: "F5",
        legend: "Imprimir",
        label: "Imprimir original",
        primary: true,
        action: { kind: "print_original_receipt" },
      },
    ]);
  });

  it("offers no print when the core says the receipt cannot be printed", () => {
    expect(saleActionsOf({ ...DETAIL, reprint: { kind: "sale_voided" } }).entries).toEqual([]);
  });

  it("offers no void when the core says it is not voidable", () => {
    const { canVoid } = saleActionsOf({
      ...DETAIL,
      voidability: { kind: "not_voidable", refusal: "session_closed" },
    });

    expect(canVoid).toBe(false);
  });

  it("reprints the factura of a sale that was deferred with F6", () => {
    const { entries } = saleActionsOf({
      ...DETAIL,
      deferred_invoice_next_copy: { kind: "duplicate", order_number: 1 },
    });

    expect(entries).toEqual([
      expect.objectContaining({ key: "F6", legend: "Factura", label: "Reimprimir factura" }),
      expect.objectContaining({ key: "F5", legend: "Reimprimir" }),
    ]);
    expect(entries[0]).toMatchObject({
      primary: false,
      action: { kind: "reprint_deferred_invoice" },
    });
  });

  it("offers the credit notes of its returns as buttons without a key", () => {
    const creditNote = {
      credit_note_id: "cn-2",
      origin: "sale_return",
      standing: AUTHORIZED_CREDIT_NOTE,
      next_copy: { kind: "original" },
    } as const;

    const { entries } = saleActionsOf({ ...DETAIL, credit_notes: [creditNote] });

    expect(entries[0]).toEqual({
      key: undefined,
      legend: undefined,
      label: "Imprimir nota de crédito",
      primary: false,
      action: { kind: "print_credit_note", creditNote },
    });
  });

  it("names each credit note by its number when there are several", () => {
    const one = {
      credit_note_id: "cn-2",
      origin: "sale_return",
      standing: AUTHORIZED_CREDIT_NOTE,
      next_copy: { kind: "original" },
    } as const;
    const other = {
      ...one,
      credit_note_id: "cn-3",
      standing: { ...AUTHORIZED_CREDIT_NOTE, number: 22 },
    } as const;

    const { entries } = saleActionsOf({ ...DETAIL, credit_notes: [one, other] });

    expect(entries.map(({ label }) => label)).toEqual([
      "Imprimir nota de crédito 00003-00000021",
      "Imprimir nota de crédito 00003-00000022",
      "Reimprimir",
    ]);
  });

  it("skips a credit note the core gives no copy to print of", () => {
    const { entries } = saleActionsOf({
      ...DETAIL,
      credit_notes: [
        {
          credit_note_id: "cn-2",
          origin: "sale_return",
          standing: { kind: "in_progress" },
          next_copy: null,
        },
      ],
    });

    expect(entries.map(({ key }) => key)).toEqual(["F5"]);
  });
});

describe("saleActionsOf a voided sale", () => {
  it("reprints the credit note with F5 and, when its original was attempted, the factura with F6", () => {
    const { entries, canVoid } = saleActionsOf(VOIDED);

    expect(entries).toEqual([
      {
        key: "F6",
        legend: "Factura",
        label: "Reimprimir factura",
        primary: false,
        action: { kind: "reprint_receipt" },
      },
      {
        key: "F5",
        legend: "Nota de crédito",
        label: "Reimprimir nota de crédito",
        primary: true,
        action: { kind: "reprint_credit_note", creditNote: VOID_CREDIT_NOTE },
      },
    ]);
    expect(canVoid).toBe(false);
  });

  it("offers no factura when the core refuses its reprint", () => {
    const { entries } = saleActionsOf({ ...VOIDED, reprint: { kind: "sale_voided" } });

    expect(entries.map(({ key }) => key)).toEqual(["F5"]);
  });

  it("prints the credit note's original when the core says it was never printed", () => {
    const creditNote = VOID_CREDIT_NOTE;
    const { entries } = saleActionsOf({
      ...VOIDED,
      reprint: { kind: "sale_voided" },
      credit_notes: [{ ...creditNote, next_copy: { kind: "original" } }],
    });

    expect(entries).toEqual([
      expect.objectContaining({
        key: "F5",
        legend: "Nota de crédito",
        label: "Imprimir nota de crédito",
        action: {
          kind: "print_credit_note",
          creditNote: { ...creditNote, next_copy: { kind: "original" } },
        },
      }),
    ]);
  });

  it("offers no F5 when its credit note cannot be printed", () => {
    const { entries } = saleActionsOf({ ...VOIDED, credit_notes: [] });

    expect(entries.map(({ key }) => key)).toEqual(["F6"]);
  });
});

describe("saleActionsOf a deferred sale", () => {
  it("prints its invoice with Enter and offers no F5", () => {
    const { entries } = saleActionsOf({
      ...DETAIL,
      state: "deferred",
      comprobante: { kind: "deferred_non_fiscal" },
      next_copy: { kind: "original" },
    });

    expect(entries).toEqual([
      {
        key: "Enter",
        legend: "Imprimir factura",
        label: "Imprimir factura",
        primary: true,
        action: { kind: "print_deferred_invoice" },
      },
    ]);
  });
});

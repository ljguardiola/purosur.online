import type { ReceiptCopyShown } from "@purosur/contracts";
import type { SaleDetail, SaleDetailCreditNote } from "../shell/sale-receipt-text";
import { creditNotePrintButton } from "./credit-note-text";

export type PrintableCreditNote = SaleDetailCreditNote & { next_copy: ReceiptCopyShown };

export type SaleAction =
  | { kind: "print_original_receipt" }
  | { kind: "reprint_receipt" }
  | { kind: "print_credit_note"; creditNote: PrintableCreditNote }
  | { kind: "reprint_credit_note"; creditNote: PrintableCreditNote }
  | { kind: "reprint_deferred_invoice" }
  | { kind: "print_deferred_invoice" };

export type SaleActionEntry = {
  key: "F5" | "F6" | "Enter" | undefined;
  legend: string | undefined;
  label: string;
  primary: boolean;
  action: SaleAction;
};

function printableCreditNotes(sale: SaleDetail): PrintableCreditNote[] {
  return sale.credit_notes.flatMap((creditNote) =>
    creditNote.next_copy === null ? [] : [{ ...creditNote, next_copy: creditNote.next_copy }],
  );
}

function creditNoteEntry(
  creditNote: PrintableCreditNote,
  numbered: boolean,
  keyed: boolean,
): SaleActionEntry {
  return {
    key: keyed ? "F5" : undefined,
    legend: keyed ? "Nota de crédito" : undefined,
    label: creditNotePrintButton(creditNote, numbered),
    primary: keyed,
    action:
      creditNote.next_copy.kind === "duplicate"
        ? { kind: "reprint_credit_note", creditNote }
        : { kind: "print_credit_note", creditNote },
  };
}

function receiptEntry(sale: SaleDetail): SaleActionEntry {
  return sale.next_copy.kind === "original"
    ? {
        key: "F5",
        legend: "Imprimir",
        label: "Imprimir original",
        primary: true,
        action: { kind: "print_original_receipt" },
      }
    : {
        key: "F5",
        legend: "Reimprimir",
        label: "Reimprimir",
        primary: true,
        action: { kind: "reprint_receipt" },
      };
}

const FACTURA_ENTRY = {
  key: "F6",
  legend: "Factura",
  label: "Reimprimir factura",
  primary: false,
} as const;

function entriesOf(sale: SaleDetail): SaleActionEntry[] {
  if (sale.state === "deferred") {
    return [
      {
        key: "Enter",
        legend: "Imprimir factura",
        label: "Imprimir factura",
        primary: true,
        action: { kind: "print_deferred_invoice" },
      },
    ];
  }
  const creditNotes = printableCreditNotes(sale);
  const numbered = creditNotes.length > 1;
  if (sale.state === "voided") {
    const [first, ...others] = creditNotes;
    return [
      ...others.map((creditNote) => creditNoteEntry(creditNote, numbered, false)),
      ...(sale.reprint.kind === "available" && sale.next_copy.kind === "duplicate"
        ? [{ ...FACTURA_ENTRY, action: { kind: "reprint_receipt" } } as const]
        : []),
      ...(first === undefined ? [] : [creditNoteEntry(first, numbered, true)]),
    ];
  }
  return [
    ...creditNotes.map((creditNote) => creditNoteEntry(creditNote, numbered, false)),
    ...(sale.deferred_invoice_next_copy?.kind === "duplicate"
      ? [{ ...FACTURA_ENTRY, action: { kind: "reprint_deferred_invoice" } } as const]
      : []),
    ...(sale.reprint.kind === "available" ? [receiptEntry(sale)] : []),
  ];
}

export function saleActionsOf(sale: SaleDetail): {
  entries: SaleActionEntry[];
  canVoid: boolean;
} {
  return { entries: entriesOf(sale), canVoid: sale.voidability.kind === "voidable" };
}

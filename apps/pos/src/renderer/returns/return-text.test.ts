import { describe, expect, it } from "vitest";
import {
  DISPOSITION_OPTIONS,
  dispositionOutcomeText,
  findRefusalText,
  lineRefusalNotice,
  quantityText,
  REASON_OPTIONS,
  refundRefusalText,
  windowTags,
} from "./return-text";
import { NIBS, PASTA, SALE } from "./test-support/sale-for-return";

describe("the options of a return line", () => {
  it("offer the two reasons, in the words of a customer", () => {
    expect(REASON_OPTIONS).toEqual([
      { value: "change_of_mind", label: "Arrepentimiento" },
      { value: "defective", label: "Defecto" },
    ]);
  });

  it("offer the two destinations of the merchandise", () => {
    expect(DISPOSITION_OPTIONS).toEqual([
      { value: "restock", label: "A la venta" },
      { value: "discard", label: "Descarte" },
    ]);
  });

  it("say what happens to the merchandise of each destination", () => {
    expect(dispositionOutcomeText("restock")).toBe("vuelve a la venta");
    expect(dispositionOutcomeText("discard")).toBe("se descarta");
  });
});

describe("the quantity of a line", () => {
  it("is counted in units for a unit product", () => {
    expect(quantityText("UNIT", 3)).toBe("3 u");
  });

  it("is weighed in kilograms for a weighed product", () => {
    expect(quantityText("KG", 350)).toBe("0,350 kg");
  });
});

describe("the refusal of finding the sale", () => {
  it("says the sale is not in this branch", () => {
    expect(findRefusalText("not_found")).toEqual({
      title: "No encontramos esa venta en esta sucursal.",
    });
  });

  it("says a connection is needed to look for a sale of another register", () => {
    expect(findRefusalText("needs_connection")).toEqual({
      title: "Se necesita conexión a internet para buscar una venta de otra caja.",
    });
  });

  it("says looking for a sale of another register failed", () => {
    expect(findRefusalText("lookup_failed")).toEqual({
      title: "No se pudo buscar la venta en las otras cajas",
      description: "Probá de nuevo.",
    });
  });

  it("says a voided sale cannot be returned", () => {
    expect(findRefusalText("voided")).toEqual({
      title: "Esa venta está anulada: no se puede devolver.",
    });
  });

  it("asks for someone with permission when the cashier lacks it", () => {
    expect(findRefusalText("lacks_permission")).toEqual({
      title: "Hacer devoluciones necesita permiso",
      description: "Elegí quién autoriza, ingresá su PIN y volvé a escanear el ticket.",
    });
  });

  it("says a scanned code is not a ticket's QR", () => {
    expect(findRefusalText("not_a_ticket_qr")).toEqual({
      title: "Ese QR no es de un ticket",
      description:
        "Escaneá el QR de la factura C o del documento de una venta diferida, o tipeá los números impresos.",
    });
  });

  it("says the search could not be made", () => {
    expect(findRefusalText("unavailable")).toEqual({
      title: "No se pudo buscar la venta",
      description: "Probá de nuevo.",
    });
  });
});

describe("the notice of a refused line", () => {
  it("asks for the reason of the line", () => {
    expect(lineRefusalNotice({ kind: "missing_reason" }, PASTA)).toBe(
      "Elegí el motivo de Pasta de maní 380 g.",
    );
  });

  it("asks what happens with the merchandise of the line", () => {
    expect(lineRefusalNotice({ kind: "missing_disposition" }, NIBS)).toBe(
      "Elegí qué pasa con la mercadería de Nibs de cacao.",
    );
  });

  it("says how much of the line can still be returned", () => {
    expect(lineRefusalNotice({ kind: "quantity_exceeds_returnable", returnable: 3 }, PASTA)).toBe(
      "Pasta de maní 380 g: se pueden devolver hasta 3 u.",
    );
    expect(lineRefusalNotice({ kind: "quantity_exceeds_returnable", returnable: 350 }, NIBS)).toBe(
      "Nibs de cacao: se pueden devolver hasta 0,350 kg.",
    );
  });

  it("says a promotion goes back whole", () => {
    expect(lineRefusalNotice({ kind: "promotion_whole_only", returnable: 2 }, PASTA)).toBe(
      "Pasta de maní 380 g: la promoción se devuelve completa, 2 u.",
    );
  });

  it("says the window of the reason is over, with its last day", () => {
    expect(
      lineRefusalNotice(
        { kind: "outside_window", reason: "change_of_mind", last_allowed_day: "2026-09-12" },
        PASTA,
      ),
    ).toBe("Venció el plazo por arrepentimiento: se podía hasta el 12/09/2026.");
    expect(
      lineRefusalNotice(
        { kind: "outside_window", reason: "defective", last_allowed_day: "2027-03-12" },
        PASTA,
      ),
    ).toBe("Venció el plazo por defecto: se podía hasta el 12/03/2027.");
  });

  it.each([
    ["unknown_line", "Pasta de maní 380 g: esa línea ya no está en la venta."],
    ["duplicate_line", "Pasta de maní 380 g: la línea está repetida."],
    ["invalid_quantity", "Pasta de maní 380 g: ingresá una cantidad mayor a 0."],
  ] as const)("says what is wrong with a line that is %s", (kind, notice) => {
    expect(lineRefusalNotice({ kind }, PASTA)).toBe(notice);
  });
});

describe("the refusal of a refund", () => {
  it.each([
    [{ kind: "unknown_payment", payment_id: "p" }, "Ese pago no es de esta venta."],
    [{ kind: "invalid_amount", payment_id: "p" }, "Ingresá un importe mayor a 0 en cada pago."],
    [
      { kind: "exceeds_payment", payment_id: "p", remaining: 150_000 },
      "El pago solo permite reintegrar $ 1.500,00.",
    ],
    [
      { kind: "total_mismatch", refundable_total: 1_000_000, imputed: 900_000 },
      "Lo que se reintegra por los pagos tiene que sumar $ 10.000,00.",
    ],
  ] as const)("is told as %j", (refusal, text) => {
    expect(refundRefusalText(refusal)).toBe(text);
  });
});

describe("the windows of a sale", () => {
  it("tell until when each reason can be returned", () => {
    expect(windowTags(SALE.windows)).toEqual([
      { label: "Arrepentimiento hasta 27/09/2026", tone: "success" },
      { label: "Defecto hasta 12/03/2027", tone: "success" },
    ]);
  });

  it("say a reason's window is over", () => {
    expect(
      windowTags({
        change_of_mind: { last_allowed_day: "2026-09-27", open: false },
        defective: { last_allowed_day: "2027-03-12", open: true },
      }),
    ).toEqual([
      { label: "Arrepentimiento vencido", tone: "warning" },
      { label: "Defecto hasta 12/03/2027", tone: "success" },
    ]);
  });

  it("say both windows are over", () => {
    expect(
      windowTags({
        change_of_mind: { last_allowed_day: "2026-09-27", open: false },
        defective: { last_allowed_day: "2027-03-12", open: false },
      }),
    ).toEqual([
      { label: "Arrepentimiento vencido", tone: "warning" },
      { label: "Defecto vencido", tone: "warning" },
    ]);
  });
});

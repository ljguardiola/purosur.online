import { describe, expect, it } from "vitest";
import { deferredSaleInvoiceNumber, deferredSaleRefusal } from "./deferred-sale-text";

describe("deferredSaleInvoiceNumber", () => {
  it("shows the point of sale and the number of an issued invoice", () => {
    expect(deferredSaleInvoiceNumber({ kind: "issued", point_of_sale: 3, number: 1250 })).toBe(
      "PV 00003\nNº 00001250",
    );
  });

  it("says the number is assigned when the invoice is issued, while it is pending", () => {
    expect(deferredSaleInvoiceNumber({ kind: "pending" })).toBe("Se asigna al emitir");
  });
});

describe("deferredSaleRefusal", () => {
  it.each([
    [
      "not_found",
      "No hay una venta diferida con ese código en esta caja",
      "Revisá el código, o buscala en la caja donde se hizo la venta.",
    ],
    ["voided", "Esa venta se anuló", "Una venta anulada no se factura."],
    ["expired", "Pasó el plazo para facturar esta venta", "Quedó como tarea para el dueño."],
    [
      "out_of_date_order",
      "Esta venta ya no se puede facturar",
      "Ya hay facturas con fecha posterior a esta venta.",
    ],
    [
      "already_printed",
      "La factura ya se imprimió",
      "Si el cliente la perdió, reimprimí un duplicado.",
    ],
    [
      "not_a_deferred_sale_qr",
      "Ese QR no es de una venta diferida",
      "Escaneá el QR del documento no fiscal, o tipeá su código de consulta.",
    ],
    [
      "lacks_permission",
      "No tenés permiso para facturar ventas diferidas",
      "Pedile a alguien con permiso que la facture.",
    ],
    ["unavailable", "No se pudo buscar la venta", "Probá de nuevo."],
  ] as const)("tells a sale that is %s", (kind, title, description) => {
    expect(deferredSaleRefusal(kind)).toEqual({
      tone: kind === "already_printed" ? "info" : "error",
      title,
      description,
    });
  });
});

import { describe, expect, it } from "vitest";
import { contingencyNoticeText } from "./contingency-notice-text";

describe("contingencyNoticeText", () => {
  it("explains, for the offline code, that invoices come out under the backup mode and that selling goes on", () => {
    expect(contingencyNoticeText("offline_code")).toEqual({
      title: "Facturación en modo de respaldo",
      description:
        "La caja no puede pedir la autorización de cada factura en el momento y factura con su respaldo.",
      whatToDo: "Seguí vendiendo con normalidad: las facturas salen igual. Se resuelve sola.",
    });
  });

  it("explains, for deferred sales, that the customer gets the not-an-invoice slip and that invoices are issued later", () => {
    expect(contingencyNoticeText("deferring")).toEqual({
      title: "Ventas sin factura en el momento",
      description:
        "Esta caja no puede emitir la factura de cada venta en el momento, ni siquiera con su respaldo.",
      whatToDo:
        "Seguir vendiendo: se cobra, se entrega al cliente el papel que dice que todavía no es la factura, y la factura se emite sola más adelante.",
    });
  });
});

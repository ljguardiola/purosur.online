import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { ContingencyNoticeCard } from "./contingency-notice-card";

describe("ContingencyNoticeCard", () => {
  it("explains, for the offline code, that invoices come out under the backup mode and that selling goes on", async () => {
    const screen = await render(<ContingencyNoticeCard kind="offline_code" />);

    await expect.element(screen.getByText("Facturación en modo de respaldo")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "La caja no puede pedir la autorización de cada factura en el momento y factura con su respaldo.",
        ),
      )
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Seguí vendiendo con normalidad: las facturas salen igual. Se resuelve sola.",
        ),
      )
      .toBeVisible();
  });

  it("explains, for deferred sales, that invoices are issued later and that the backup tickets are kept", async () => {
    const screen = await render(<ContingencyNoticeCard kind="deferring" />);

    await expect.element(screen.getByText("Ventas sin factura en el momento")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Esta caja no puede emitir la factura de cada venta en el momento, ni siquiera con su respaldo.",
        ),
      )
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Seguir vendiendo: se cobra, se entrega al cliente el papel que dice que todavía no es la factura, y la factura se emite sola más adelante. Guardar los tickets de respaldo en la caja del local.",
        ),
      )
      .toBeVisible();
  });

  it.each([["offline_code"], ["deferring"]] as const)(
    "has no accessibility violations for %s",
    async (kind) => {
      const screen = await render(<ContingencyNoticeCard kind={kind} />);

      await expectNoAccessibilityViolations(screen.container);
    },
  );
});

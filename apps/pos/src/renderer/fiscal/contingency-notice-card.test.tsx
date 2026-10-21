import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { ContingencyNoticeCard } from "./contingency-notice-card";

describe("ContingencyNoticeCard", () => {
  it("explains that invoices come out under the backup mode and that selling goes on", async () => {
    const screen = await render(<ContingencyNoticeCard />);

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

  it("has no accessibility violations", async () => {
    const screen = await render(<ContingencyNoticeCard />);

    await expectNoAccessibilityViolations(screen.container);
  });
});

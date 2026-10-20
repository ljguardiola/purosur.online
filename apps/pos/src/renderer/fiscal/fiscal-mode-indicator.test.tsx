import { expectNoAccessibilityViolations, tokenRgb } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import {
  ContingencyNoticeCard,
  FiscalModeIndicator,
  isInContingency,
} from "./fiscal-mode-indicator";

describe("FiscalModeIndicator", () => {
  it("shows the register invoicing online in the success tone while the mode is real time", async () => {
    const screen = await render(<FiscalModeIndicator mode="real_time" />);

    const indicator = screen.getByText("Factura en línea").element();
    expect(getComputedStyle(indicator).backgroundColor).toBe(tokenRgb("success-subtle"));
  });

  it("shows the contingency mode in the warning tone while the mode is the offline code", async () => {
    const screen = await render(<FiscalModeIndicator mode="offline_code" />);

    const indicator = screen.getByText("Contingencia CAEA").element();
    expect(getComputedStyle(indicator).backgroundColor).toBe(tokenRgb("warning-subtle"));
  });

  it("shows nothing while the register is deferring its sales", async () => {
    const screen = await render(<FiscalModeIndicator mode="deferring" />);

    expect(screen.container.textContent).toBe("");
  });
});

describe("isInContingency", () => {
  it.each([
    ["real_time", false],
    ["offline_code", true],
    ["deferring", false],
  ] as const)("is decided for the mode %s as %s", (mode, inContingency) => {
    expect(isInContingency(mode)).toBe(inContingency);
  });
});

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

import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { RestoringScreen } from "./restoring-screen";

describe("RestoringScreen", () => {
  it("says the register restored from a copy cannot sell until it catches up with the cloud", async () => {
    const screen = await render(<RestoringScreen registerName="Caja 2" />);

    await expect.element(screen.getByText("CAJA 2 · RESTAURADA DESDE UNA COPIA")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "La caja no puede vender todavía" }))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Antes de vender tiene que ponerse al día con la nube, para no repetir números de factura.",
        ),
      )
      .toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("leaves the register's name out of the eyebrow when it is not known", async () => {
    const screen = await render(<RestoringScreen registerName={null} />);

    await expect.element(screen.getByText("RESTAURADA DESDE UNA COPIA")).toBeVisible();
  });

  it("offers nothing to press", async () => {
    const screen = await render(<RestoringScreen registerName="Caja 2" />);

    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
  });
});

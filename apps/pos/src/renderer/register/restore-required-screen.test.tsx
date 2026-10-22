import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { RestoreRequiredScreen } from "./restore-required-screen";

describe("RestoreRequiredScreen", () => {
  it("says the register has to be enrolled again and what it takes", async () => {
    const screen = await render(
      <RestoreRequiredScreen registerName="Caja 2" onEnroll={() => {}} />,
    );

    await expect.element(screen.getByText("CAJA 2")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "La caja tiene que volver a darse de alta" }))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Sus datos quedaron atrás de los de la nube, así que no puede vender hasta restaurarse.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByText("Pedí un código de alta")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Un Administrador lo genera desde el backoffice. Las ventas guardadas en esta notebook se conservan.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Dar de alta la caja" })).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("names just the register when its name is not known", async () => {
    const screen = await render(<RestoreRequiredScreen registerName={null} onEnroll={() => {}} />);

    await expect.element(screen.getByText("CAJA", { exact: true })).toBeVisible();
  });

  it("asks to enroll the register again", async () => {
    const enroll = vi.fn();
    const screen = await render(<RestoreRequiredScreen registerName="Caja 2" onEnroll={enroll} />);

    await userEvent.click(screen.getByRole("button", { name: "Dar de alta la caja" }));

    expect(enroll).toHaveBeenCalledOnce();
  });
});

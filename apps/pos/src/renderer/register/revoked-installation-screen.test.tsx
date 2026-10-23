import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { RevokedInstallationScreen } from "./revoked-installation-screen";

describe("RevokedInstallationScreen", () => {
  it("says the notebook is no longer the register, every way the cloud revokes one, and what it takes to sell again", async () => {
    const screen = await render(
      <RevokedInstallationScreen registerName="Caja 2" onEnroll={() => {}} />,
    );

    await expect.element(screen.getByText("CAJA 2")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Esta notebook ya no es la Caja 2" }))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "La caja se dio de alta en otra notebook, se la dio de baja desde el backoffice o la nube encontró un problema en su registro de operaciones.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByText("No se pueden abrir ventas")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Las ventas guardadas en esta notebook se conservan. Para volver a vender, pedí al Administrador un código de alta.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Dar de alta la caja" })).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("names just the notebook when the register's name is not known", async () => {
    const screen = await render(
      <RevokedInstallationScreen registerName={null} onEnroll={() => {}} />,
    );

    await expect.element(screen.getByText("CAJA", { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "Esta notebook dejó de ser una caja" }))
      .toBeVisible();
  });

  it("asks to enroll the register again", async () => {
    const enroll = vi.fn();
    const screen = await render(
      <RevokedInstallationScreen registerName="Caja 2" onEnroll={enroll} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Dar de alta la caja" }));

    expect(enroll).toHaveBeenCalledOnce();
  });
});

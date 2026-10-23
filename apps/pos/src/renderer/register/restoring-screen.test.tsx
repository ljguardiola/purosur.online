import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { RestoringScreen } from "./restoring-screen";

describe("RestoringScreen", () => {
  it("says the register restored from a copy cannot sell until it catches up with the cloud", async () => {
    const screen = await render(
      <RestoringScreen
        registerName="Caja 2"
        standing={{ kind: "in_progress", step: "reset_sync_identity" }}
      />,
    );

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
    const screen = await render(
      <RestoringScreen registerName={null} standing={{ kind: "in_progress", step: "replenish" }} />,
    );

    await expect.element(screen.getByText("RESTAURADA DESDE UNA COPIA")).toBeVisible();
  });

  it("says the register is being restored from a copy while the copy is not restored yet", async () => {
    const screen = await render(
      <RestoringScreen registerName="Caja 2" standing={{ kind: "in_progress", step: "restore" }} />,
    );

    await expect.element(screen.getByText("CAJA 2 · RESTAURANDO DESDE UNA COPIA")).toBeVisible();
    await expect
      .element(screen.getByText("CAJA 2 · RESTAURADA DESDE UNA COPIA"))
      .not.toBeInTheDocument();
  });

  it("says just that the register is being restored when its name is not known", async () => {
    const screen = await render(
      <RestoringScreen registerName={null} standing={{ kind: "in_progress", step: "restore" }} />,
    );

    await expect.element(screen.getByText("RESTAURANDO DESDE UNA COPIA")).toBeVisible();
  });

  it("says the register was reinstalled with no copy, with the same hold on selling", async () => {
    const screen = await render(
      <RestoringScreen
        registerName="Caja 2"
        standing={{ kind: "in_progress", step: "replenish", origin: "no_copy" }}
      />,
    );

    await expect.element(screen.getByText("CAJA 2 · REINSTALADA SIN COPIA")).toBeVisible();
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
    await expect
      .element(screen.getByText("CAJA 2 · RESTAURADA DESDE UNA COPIA"))
      .not.toBeInTheDocument();
  });

  it("says the register reinstalled with no copy also needs the connection", async () => {
    const screen = await render(
      <RestoringScreen
        registerName={null}
        standing={{ kind: "without_connection", step: "replenish", origin: "no_copy" }}
      />,
    );

    await expect.element(screen.getByText("REINSTALADA SIN COPIA")).toBeVisible();
    await expect.element(screen.getByText("Sin conexión con la nube")).toBeVisible();
  });

  it("offers nothing to press", async () => {
    const screen = await render(
      <RestoringScreen
        registerName="Caja 2"
        standing={{ kind: "in_progress", step: "reset_sync_identity" }}
      />,
    );

    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
  });

  it("says the register cannot sell without the cloud and how to get connected", async () => {
    const screen = await render(
      <RestoringScreen
        registerName="Caja 2"
        standing={{ kind: "without_connection", step: "replenish" }}
      />,
    );

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
    await expect.element(screen.getByText("Sin conexión con la nube")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Si el local no tiene internet, conectá la notebook al hotspot de un celular. La caja sigue sola en cuanto hay conexión.",
        ),
      )
      .toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("says the copy is still being restored when the cloud is out of reach during the restore", async () => {
    const screen = await render(
      <RestoringScreen
        registerName="Caja 2"
        standing={{ kind: "without_connection", step: "restore" }}
      />,
    );

    await expect.element(screen.getByText("CAJA 2 · RESTAURANDO DESDE UNA COPIA")).toBeVisible();
    await expect.element(screen.getByText("Sin conexión con la nube")).toBeVisible();
  });

  it("says no copy of the register could be restored and to contact support", async () => {
    const screen = await render(
      <RestoringScreen registerName="Caja 2" standing={{ kind: "failed", step: "restore" }} />,
    );

    await expect.element(screen.getByText("CAJA 2 · SIN COPIA PARA RESTAURAR")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "No se pudo restaurar la caja" }))
      .toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Ninguna copia de esta caja se pudo recuperar. Se vuelve a intentar la próxima vez que se inicie la aplicación.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByText("Contactá a soporte")).toBeVisible();
    await expect.element(screen.getByText("Mientras tanto la caja no puede vender.")).toBeVisible();
    await expect.element(screen.getByText("Sin conexión con la nube")).not.toBeInTheDocument();

    await expectNoAccessibilityViolations(screen.container);
  });
});

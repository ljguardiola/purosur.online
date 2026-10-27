import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { RestoringScreen } from "./restoring-screen";

describe("RestoringScreen", () => {
  it("says the register restored from a copy cannot sell until it catches up with the cloud", async () => {
    const screen = await render(
      <RestoringScreen
        registerName="Caja 2"
        standing={{ kind: "in_progress", step: "reset_sync_identity", origin: "copy" }}
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
      <RestoringScreen
        registerName={null}
        standing={{ kind: "in_progress", step: "replenish", origin: "copy" }}
      />,
    );

    await expect.element(screen.getByText("RESTAURADA DESDE UNA COPIA")).toBeVisible();
  });

  it("says the register is being restored from a copy while the copy is not restored yet", async () => {
    const screen = await render(
      <RestoringScreen
        registerName="Caja 2"
        standing={{ kind: "in_progress", step: "restore", origin: "copy" }}
      />,
    );

    await expect.element(screen.getByText("CAJA 2 · RESTAURANDO DESDE UNA COPIA")).toBeVisible();
    await expect
      .element(screen.getByText("CAJA 2 · RESTAURADA DESDE UNA COPIA"))
      .not.toBeInTheDocument();
  });

  it("says just that the register is being restored when its name is not known", async () => {
    const screen = await render(
      <RestoringScreen
        registerName={null}
        standing={{ kind: "in_progress", step: "restore", origin: "copy" }}
      />,
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
        standing={{ kind: "in_progress", step: "reset_sync_identity", origin: "copy" }}
      />,
    );

    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
  });

  it("says the register cannot sell without the cloud and how to get connected", async () => {
    const screen = await render(
      <RestoringScreen
        registerName="Caja 2"
        standing={{ kind: "without_connection", step: "replenish", origin: "copy" }}
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
        standing={{ kind: "without_connection", step: "restore", origin: "copy" }}
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

  it.each(["refused", "unreadable_event"] as const)(
    "says the register restored from a copy could not catch up and cannot sell, when the failure is %s",
    async (failure) => {
      const screen = await render(
        <RestoringScreen
          registerName="Caja 2"
          standing={{ kind: "failed", step: "replenish", failure, origin: "copy" }}
        />,
      );

      await expect.element(screen.getByText("CAJA 2 · RESTAURADA DESDE UNA COPIA")).toBeVisible();
      await expect
        .element(screen.getByRole("heading", { name: "La caja no pudo ponerse al día" }))
        .toBeVisible();
      await expect
        .element(screen.getByText("La caja no puede vender hasta ponerse al día con la nube."))
        .toBeVisible();
      await expect.element(screen.getByText("Sin conexión con la nube")).not.toBeInTheDocument();
    },
  );

  it("says the register reinstalled without a copy could not catch up", async () => {
    const screen = await render(
      <RestoringScreen
        registerName="Caja 2"
        standing={{ kind: "failed", step: "replenish", failure: "refused", origin: "no_copy" }}
      />,
    );

    await expect.element(screen.getByText("CAJA 2 · REINSTALADA SIN COPIA")).toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "La caja no pudo ponerse al día" }))
      .toBeVisible();
  });

  it("tells to update the register when it received what its version cannot read", async () => {
    const screen = await render(
      <RestoringScreen
        registerName="Caja 2"
        standing={{
          kind: "failed",
          step: "replenish",
          failure: "unreadable_event",
          origin: "copy",
        }}
      />,
    );

    await expect.element(screen.getByText("Actualizá la caja")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "Esta versión no puede leer parte de lo que mandó la nube. Después de actualizar, la caja lo intenta sola.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByText("Llamá a un Administrador")).not.toBeInTheDocument();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("tells to call an Administrator when the cloud refused to bring the register up to date", async () => {
    const screen = await render(
      <RestoringScreen
        registerName="Caja 2"
        standing={{ kind: "failed", step: "replenish", failure: "refused", origin: "copy" }}
      />,
    );

    await expect.element(screen.getByText("Llamá a un Administrador")).toBeVisible();
    await expect
      .element(
        screen.getByText(
          "La nube rechazó ponerla al día. Un Administrador tiene que dar de alta la caja de nuevo.",
        ),
      )
      .toBeVisible();
    await expect.element(screen.getByText("Actualizá la caja")).not.toBeInTheDocument();

    await expectNoAccessibilityViolations(screen.container);
  });

  it.each([
    ["in_progress", { kind: "in_progress", step: "recover_contingency_tickets", origin: "copy" }],
    [
      "without_connection",
      { kind: "without_connection", step: "recover_contingency_tickets", origin: "copy" },
    ],
  ] as const)(
    "asks to look for an unfiled backup ticket and to scan the tickets in the backoffice while %s at the ticket recovery",
    async (_kind, standing) => {
      const screen = await render(<RestoringScreen registerName="Caja 2" standing={standing} />);

      await expect
        .element(screen.getByRole("heading", { name: "La caja no puede vender todavía" }))
        .toBeVisible();
      await expect.element(screen.getByText("Revisá la impresora y el mostrador")).toBeVisible();
      await expect
        .element(
          screen.getByText(
            "Buscá un ticket de respaldo que todavía no se haya guardado en la caja del local: el último suele seguir ahí.",
          ),
        )
        .toBeVisible();
      await expect.element(screen.getByText("Escaneá los tickets en el backoffice")).toBeVisible();
      await expect
        .element(
          screen.getByText(
            "En Rescate de tickets. La caja sigue sola cuando se termina el rescate.",
          ),
        )
        .toBeVisible();

      await expectNoAccessibilityViolations(screen.container);
    },
  );

  it("keeps the hotspot notice beside the ticket recovery notices while there is no connection", async () => {
    const screen = await render(
      <RestoringScreen
        registerName="Caja 2"
        standing={{
          kind: "without_connection",
          step: "recover_contingency_tickets",
          origin: "copy",
        }}
      />,
    );

    await expect.element(screen.getByText("Sin conexión con la nube")).toBeVisible();
    await expect.element(screen.getByText("Revisá la impresora y el mostrador")).toBeVisible();
  });

  it("shows no ticket recovery notice at another step", async () => {
    const screen = await render(
      <RestoringScreen
        registerName="Caja 2"
        standing={{ kind: "in_progress", step: "replenish", origin: "copy" }}
      />,
    );

    await expect
      .element(screen.getByText("Revisá la impresora y el mostrador"))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByText("Escaneá los tickets en el backoffice"))
      .not.toBeInTheDocument();
  });
});

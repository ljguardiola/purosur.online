import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { OlderVersionScreen } from "./older-version-screen";

const TITLE = "Hay que instalar la versión vigente";
const REASON = "Esta versión de la caja es anterior a la base de datos, así que no puede abrirla.";
const NOTICE_TITLE = "Instalando la versión vigente";
const NOTICE_DESCRIPTION =
  "Se descarga sola si hay internet y la caja arranca al terminar. Si no hay internet, avisá al Administrador.";

describe("OlderVersionScreen", () => {
  it("says the current version must be installed and why this one cannot open the database", async () => {
    const screen = await render(<OlderVersionScreen />);

    await expect.element(screen.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
    await expect.element(screen.getByText(REASON)).toBeVisible();

    await expectNoAccessibilityViolations(screen.container);
  });

  it("tells that the current version installs itself and what to do without internet", async () => {
    const screen = await render(<OlderVersionScreen />);

    await expect.element(screen.getByText(NOTICE_TITLE)).toBeVisible();
    await expect.element(screen.getByText(NOTICE_DESCRIPTION)).toBeVisible();
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent(`${NOTICE_TITLE}${NOTICE_DESCRIPTION}`);
  });

  it("offers nothing to press", async () => {
    const screen = await render(<OlderVersionScreen />);

    await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
    await expect.element(screen.getByRole("link")).not.toBeInTheDocument();
  });
});

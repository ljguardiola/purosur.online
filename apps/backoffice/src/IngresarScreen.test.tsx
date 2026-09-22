import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../packages/ui/src/test/axe";
import { IngresarScreen } from "./IngresarScreen";

test("shows the Ingresar heading, its passkey copy and the recovery link, without a passkey sign-in button", async () => {
  const screen = await render(<IngresarScreen />);

  await expect.element(screen.getByRole("heading", { name: "Ingresar", level: 1 })).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Con la passkey de este dispositivo: la huella, la cara o el PIN de la computadora o del teléfono.",
      ),
    )
    .toBeVisible();

  const link = screen.getByRole("link", { name: "Perdí mis passkeys" }).element();
  expect(link.getAttribute("href")).toBe("/recuperar");

  expect(screen.getByRole("button").query()).toBeNull();

  await expectNoAccessibilityViolations(screen.container);
});

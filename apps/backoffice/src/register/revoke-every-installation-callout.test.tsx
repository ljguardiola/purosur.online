import { expectNoAccessibilityViolations } from "@purosur/ui/test";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { RevokeEveryInstallationCallout } from "./revoke-every-installation-callout";

test("gives the reason to revoke every installation and what it does", async () => {
  const screen = await render(<RevokeEveryInstallationCallout onRevoke={() => {}} />);

  await expect.element(screen.getByText("Ante una sospecha de compromiso")).toBeVisible();
  await expect
    .element(
      screen.getByText(
        "Revoca todas las instalaciones en el momento y cambia sus claves. Cada caja se vuelve a dar de alta con un código nuevo.",
      ),
    )
    .toBeVisible();
});

test("its button asks to revoke every installation", async () => {
  const onRevoke = vi.fn();
  const screen = await render(<RevokeEveryInstallationCallout onRevoke={onRevoke} />);

  await userEvent.click(screen.getByRole("button", { name: "Revocar todas las instalaciones" }));

  expect(onRevoke).toHaveBeenCalledTimes(1);
});

test("has no accessibility violations", async () => {
  const screen = await render(
    <main>
      <RevokeEveryInstallationCallout onRevoke={() => {}} />
    </main>,
  );

  await expect
    .element(screen.getByRole("button", { name: "Revocar todas las instalaciones" }))
    .toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

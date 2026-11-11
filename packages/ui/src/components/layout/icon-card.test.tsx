import { Lock } from "lucide-react";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { IconCard } from "./icon-card";

test("names its icon for assistive technology and fills the height it is given", async () => {
  const screen = await render(
    <div style={{ display: "flex", flexDirection: "column", height: "400px" }}>
      <IconCard icon={<Lock />} label="Caja sin sesión abierta" />
    </div>,
  );

  const icon = screen.getByRole("img", { name: "Caja sin sesión abierta" });
  await expect.element(icon).toBeVisible();
  const card = icon.element().parentElement?.parentElement;
  expect(card?.getBoundingClientRect().height).toBe(400);
  await expectNoAccessibilityViolations(screen.container);
});

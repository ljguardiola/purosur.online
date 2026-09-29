import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { AlertsOpenCountPill } from "./alerts-open-count-pill";

test("counts one open alert in the singular and several in the plural", async () => {
  const one = await render(<AlertsOpenCountPill openCount={1} />);
  await expect.element(one.getByText("1 alerta abierta", { exact: true })).toBeVisible();

  const several = await render(<AlertsOpenCountPill openCount={8} />);
  await expect.element(several.getByText("8 alertas abiertas", { exact: true })).toBeVisible();
});

test("writes the count in Argentine Spanish", async () => {
  const screen = await render(<AlertsOpenCountPill openCount={1234} />);

  await expect.element(screen.getByText("1.234 alertas abiertas", { exact: true })).toBeVisible();
});

test("shows nothing while no alert is open", async () => {
  const screen = await render(<AlertsOpenCountPill openCount={0} />);

  expect(screen.container.textContent).toBe("");
});

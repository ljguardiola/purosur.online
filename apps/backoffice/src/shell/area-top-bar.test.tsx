import { Button } from "@purosur/ui";
import { expect, test } from "vitest";
import { AreaTopBar } from "./area-top-bar";
import { render } from "./test-support/render-with-router";

test("shows the title as the page heading and the action", async () => {
  const screen = await render(
    <AreaTopBar title="Listas de proveedores" action={<Button>Cargar una lista</Button>} />,
  );

  await expect
    .element(screen.getByRole("heading", { name: "Listas de proveedores", level: 1 }))
    .toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Cargar una lista" })).toBeVisible();
});

test("shows nothing above the title", async () => {
  const screen = await render(<AreaTopBar title="Productos" />);

  const title = screen.getByRole("heading", { name: "Productos", level: 1 });
  await expect.element(title).toBeVisible();
  expect(title.element().previousElementSibling).toBeNull();
});

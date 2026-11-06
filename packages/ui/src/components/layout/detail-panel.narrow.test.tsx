import { beforeEach, expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { ConfirmationInsidePanel, SuppliersArea } from "./test-support/detail-panel";

const NARROW_AREA = 799;
const WIDE_AREA = 800;

beforeEach(async () => {
  await page.viewport(1280, 800);
});

test("opens as a wide modal dialog named by its title when the area is narrower than 800px", async () => {
  const screen = await render(
    <SuppliersArea
      areaWidth={NARROW_AREA}
      footer={<button type="button">Guardar cambios</button>}
    />,
  );

  await screen.getByRole("button", { name: "Distribuidora Norte" }).click();

  const dialog = screen.getByRole("dialog", { name: "Distribuidora Norte" });
  await expect.element(dialog).toBeVisible();
  expect(dialog.element().getBoundingClientRect().width).toBe(720);
  await expect.element(screen.getByRole("heading", { name: "Distribuidora Norte" })).toBeVisible();
  await expect.element(screen.getByText("Datos del proveedor")).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Guardar cambios" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Cerrar" })).toBeVisible();
  await expectNoAccessibilityViolations(document.body);
});

test("opens beside the list when the area is exactly 800px wide", async () => {
  const screen = await render(<SuppliersArea areaWidth={WIDE_AREA} />);

  await screen.getByRole("button", { name: "Distribuidora Norte" }).click();

  await expect.element(screen.getByRole("complementary")).toBeVisible();
  expect(screen.getByRole("dialog").elements()).toHaveLength(0);
});

test("decides by the width of its area, not by the window's", async () => {
  await page.viewport(500, 800);
  const wide = await render(<SuppliersArea areaWidth={1200} />);

  await wide.getByRole("button", { name: "Distribuidora Norte" }).click();

  await expect.element(wide.getByRole("complementary")).toBeVisible();
  expect(wide.getByRole("dialog").elements()).toHaveLength(0);
  await wide.unmount();

  await page.viewport(1600, 900);
  const narrow = await render(<SuppliersArea areaWidth={500} />);
  await narrow.getByRole("button", { name: "Distribuidora Norte" }).click();
  await expect.element(narrow.getByRole("dialog")).toBeVisible();
});

test("switches between beside the list and a modal as its area is resized", async () => {
  const screen = await render(<SuppliersArea areaWidth={1200} />);
  const area = screen.getByTestId("area").element() as HTMLElement;
  await screen.getByRole("button", { name: "Distribuidora Norte" }).click();
  await expect.element(screen.getByRole("complementary")).toBeVisible();

  area.style.width = "600px";
  await expect.element(screen.getByRole("dialog", { name: "Distribuidora Norte" })).toBeVisible();

  area.style.width = "1000px";
  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(0);
  await expect
    .element(screen.getByRole("complementary", { name: "Distribuidora Norte" }))
    .toBeVisible();
});

test("keeps what was typed inside it while its area is resized", async () => {
  const screen = await render(
    <SuppliersArea areaWidth={1200}>
      <input aria-label="Nota" />
    </SuppliersArea>,
  );
  const area = screen.getByTestId("area").element() as HTMLElement;
  await screen.getByRole("button", { name: "Distribuidora Norte" }).click();
  await screen.getByRole("textbox", { name: "Nota" }).fill("Llamar el lunes");

  area.style.width = "600px";
  await expect.element(screen.getByRole("dialog", { name: "Distribuidora Norte" })).toBeVisible();
  await expect
    .element(screen.getByRole("textbox", { name: "Nota" }))
    .toHaveValue("Llamar el lunes");

  area.style.width = "1000px";
  await expect.poll(() => screen.getByRole("dialog").elements().length).toBe(0);
  await expect
    .element(screen.getByRole("textbox", { name: "Nota" }))
    .toHaveValue("Llamar el lunes");
});

test("closes on Escape and gives focus back to the pressed row", async () => {
  const screen = await render(<SuppliersArea areaWidth={NARROW_AREA} />);
  const row = screen.getByRole("button", { name: "Almacén Sur" });
  await row.click();
  await expect.element(screen.getByRole("heading", { name: "Almacén Sur" })).toHaveFocus();

  await userEvent.keyboard("{Escape}");

  expect(screen.getByRole("dialog").elements()).toHaveLength(0);
  await expect.element(row).toHaveFocus();
});

test("closes on Escape after a click on plain text inside it", async () => {
  const screen = await render(<SuppliersArea areaWidth={NARROW_AREA} />);
  await screen.getByRole("button", { name: "Almacén Sur" }).click();

  await screen.getByText("Datos del proveedor").click();
  await userEvent.keyboard("{Escape}");

  expect(screen.getByRole("dialog").elements()).toHaveLength(0);
});

test("closes with its close button and stays open when the backdrop is clicked", async () => {
  const screen = await render(<SuppliersArea areaWidth={NARROW_AREA} />);
  await screen.getByRole("button", { name: "Almacén Sur" }).click();

  await userEvent.click(document.body, { position: { x: 5, y: 5 } });
  await expect.element(screen.getByRole("dialog")).toBeVisible();

  await screen.getByRole("button", { name: "Cerrar" }).click();
  expect(screen.getByRole("dialog").elements()).toHaveLength(0);
});

test("keeps the keyboard focus inside while it is open", async () => {
  const screen = await render(
    <SuppliersArea areaWidth={NARROW_AREA}>
      <button type="button">Editar datos</button>
    </SuppliersArea>,
  );
  await screen.getByRole("button", { name: "Almacén Sur" }).click();

  for (let press = 0; press < 6; press += 1) {
    await userEvent.tab();
    expect(screen.getByRole("dialog").element().contains(document.activeElement)).toBe(true);
  }
});

test("keeps its footer visible and scrolls a long body inside the modal", async () => {
  const lines = Array.from({ length: 60 }, (_, index) => `Línea ${index + 1}`);
  const screen = await render(
    <SuppliersArea areaWidth={NARROW_AREA} footer={<button type="button">Guardar cambios</button>}>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </SuppliersArea>,
  );
  await screen.getByRole("button", { name: "Almacén Sur" }).click();

  const dialog = screen.getByRole("dialog").element().getBoundingClientRect();
  const footer = screen
    .getByRole("button", { name: "Guardar cambios" })
    .element()
    .getBoundingClientRect();
  expect(dialog.bottom).toBeLessThanOrEqual(800);
  expect(footer.bottom).toBeLessThanOrEqual(dialog.bottom);
  expect(footer.top).toBeGreaterThanOrEqual(dialog.top);
  await expect
    .element(screen.getByRole("region", { name: "Almacén Sur" }))
    .toHaveAttribute("tabindex", "0");
});

test("stays open when Escape reaches a modal opened from its content", async () => {
  const screen = await render(
    <SuppliersArea areaWidth={NARROW_AREA}>
      <ConfirmationInsidePanel closable={false} />
    </SuppliersArea>,
  );
  await screen.getByRole("button", { name: "Almacén Sur" }).click();
  await screen.getByRole("button", { name: "Eliminar proveedor" }).click();
  await expect.element(screen.getByRole("dialog", { name: "Confirmar eliminación" })).toBeVisible();

  await userEvent.keyboard("{Escape}");

  await expect.element(screen.getByRole("dialog", { name: "Almacén Sur" })).toBeVisible();
});

import type { ReactNode } from "react";
import { beforeEach, expect, expectTypeOf, test } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import type { DetailPanelProps } from "./detail-panel";
import { SuppliersArea } from "./test-support/detail-panel";

const WIDE_AREA = 1200;

beforeEach(async () => {
  await page.viewport(1280, 800);
});

test("renders nothing while it is closed", async () => {
  const screen = await render(<SuppliersArea areaWidth={WIDE_AREA} />);

  expect(screen.getByRole("complementary").elements()).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Cerrar" }).elements()).toHaveLength(0);
  expect(screen.getByRole("dialog").elements()).toHaveLength(0);
});

test("opens beside the list as a landmark named by its title, leaving the list usable", async () => {
  const screen = await render(<SuppliersArea areaWidth={WIDE_AREA} />);

  await screen.getByRole("button", { name: "Distribuidora Norte" }).click();

  const panel = screen.getByRole("complementary", { name: "Distribuidora Norte" });
  await expect.element(panel).toBeVisible();
  expect(screen.getByRole("dialog").elements()).toHaveLength(0);
  await expect.element(screen.getByText("Datos del proveedor")).toBeVisible();
  const list = screen.getByRole("list").element().getBoundingClientRect();
  expect(list.right).toBeLessThanOrEqual(panel.element().getBoundingClientRect().left);
  await screen.getByRole("button", { name: "Almacén Sur" }).click();
  await expect.element(screen.getByRole("complementary", { name: "Almacén Sur" })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows its title as a heading above a close button", async () => {
  const screen = await render(<SuppliersArea areaWidth={WIDE_AREA} />);

  await screen.getByRole("button", { name: "Almacén Sur" }).click();

  const heading = screen.getByRole("heading", { level: 2, name: "Almacén Sur" });
  await expect.element(heading).toBeVisible();
  expect(getComputedStyle(heading.element()).color).toBe(tokenRgb("text"));
  const close = screen.getByRole("button", { name: "Cerrar" }).element().getBoundingClientRect();
  expect(close.top).toBeLessThan(
    screen.getByText("Datos del proveedor").element().getBoundingClientRect().top,
  );
});

test("closes when its close button is pressed", async () => {
  const screen = await render(<SuppliersArea areaWidth={WIDE_AREA} />);
  await screen.getByRole("button", { name: "Almacén Sur" }).click();

  await screen.getByRole("button", { name: "Cerrar" }).click();

  expect(screen.getByRole("complementary").elements()).toHaveLength(0);
});

test("keeps the header and the footer fixed while a long body scrolls between them", async () => {
  const lines = Array.from({ length: 40 }, (_, index) => `Línea ${index + 1}`);
  const screen = await render(
    <SuppliersArea areaWidth={WIDE_AREA} footer={<button type="button">Guardar cambios</button>}>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </SuppliersArea>,
  );
  await screen.getByRole("button", { name: "Almacén Sur" }).click();
  const heading = screen.getByRole("heading", { name: "Almacén Sur" }).element();
  const footer = screen.getByRole("button", { name: "Guardar cambios" }).element();
  const headingBox = heading.getBoundingClientRect();
  const footerBox = footer.getBoundingClientRect();

  let area = screen.getByText("Línea 40", { exact: true }).element().parentElement;
  while (area !== null && area.scrollHeight <= area.clientHeight) {
    area = area.parentElement;
  }
  if (area === null) {
    throw new Error("No area around the body scrolls");
  }
  area.scrollTop = area.scrollHeight;

  expect(heading.getBoundingClientRect()).toEqual(headingBox);
  expect(footer.getBoundingClientRect()).toEqual(footerBox);
  expect(footerBox.bottom).toBeGreaterThan(headingBox.bottom);
  await userEvent.tab();
  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a panel without its record's key, its title or its content", () => {
  expectTypeOf<{
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
  }>().not.toExtend<DetailPanelProps>();
  expectTypeOf<{
    open: boolean;
    onClose: () => void;
    recordKey: string;
    children: ReactNode;
  }>().not.toExtend<DetailPanelProps>();
  expectTypeOf<{
    open: boolean;
    onClose: () => void;
    recordKey: string;
    title: string;
  }>().not.toExtend<DetailPanelProps>();
});

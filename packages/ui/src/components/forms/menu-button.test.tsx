import { ClipboardCheck, PackageX } from "lucide-react";
import { expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import type { RowMenuActions } from "../data-display/table/row-actions-menu";
import { MenuButton } from "./menu-button";

function actions(onAction = () => {}): RowMenuActions {
  return [
    { label: "Recuento", icon: <ClipboardCheck />, onAction },
    { label: "Pérdida", icon: <PackageX />, onAction: () => {} },
  ];
}

async function renderMenuButton(menuActions: RowMenuActions = actions()) {
  await page.viewport(1280, 900);
  const screen = await render(<MenuButton label="Registrar" actions={menuActions} />);
  return { screen, trigger: screen.getByRole("button", { name: "Registrar" }) };
}

test("shows a button named by its label that starts with its menu closed", async () => {
  const { screen, trigger } = await renderMenuButton();

  await expect.element(trigger).toBeVisible();
  await expect.element(trigger).toHaveAttribute("aria-haspopup", "true");
  await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("menu").elements()).toHaveLength(0);
});

test("opens a menu listing every action in order when pressed", async () => {
  const { screen, trigger } = await renderMenuButton();

  await userEvent.click(trigger);

  await expect.element(screen.getByRole("menu")).toBeVisible();
  const items = screen.getByRole("menuitem").elements();
  expect(items.map((item) => item.textContent)).toEqual(["Recuento", "Pérdida"]);
});

test("calls the chosen action once and closes the menu", async () => {
  const onAction = vi.fn();
  const { screen, trigger } = await renderMenuButton(actions(onAction));
  await userEvent.click(trigger);

  await userEvent.click(screen.getByRole("menuitem", { name: "Recuento" }));

  expect(onAction).toHaveBeenCalledTimes(1);
  await expect.poll(() => screen.getByRole("menu").elements()).toHaveLength(0);
});

test("opens with the keyboard and focuses the first action", async () => {
  const { screen, trigger } = await renderMenuButton();
  (trigger.element() as HTMLElement).focus();

  await userEvent.keyboard("{Enter}");

  await expect.element(screen.getByRole("menuitem", { name: "Recuento" })).toHaveFocus();
});

test("has no accessibility violations when open", async () => {
  const { screen, trigger } = await renderMenuButton();
  await userEvent.click(trigger);

  await expectNoAccessibilityViolations(screen.container);
});

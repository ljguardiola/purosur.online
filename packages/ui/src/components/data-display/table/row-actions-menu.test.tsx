import { Pencil, Trash2 } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { cdp, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../../test/axe";
import { tokenRgb } from "../../../test/token-colors";
import { RowActionsMenu, type RowMenuAction, type RowMenuActions } from "./row-actions-menu";

function actions(overrides: Partial<RowMenuAction>[] = []): RowMenuActions {
  return [
    { label: "Editar", icon: <Pencil />, onAction: () => {}, ...overrides[0] },
    { label: "Duplicar", onAction: () => {}, ...overrides[1] },
    { label: "Eliminar", icon: <Trash2 />, onAction: () => {}, ...overrides[2] },
  ];
}

async function renderMenu(menuActions: RowMenuActions = actions()) {
  await page.viewport(1280, 900);
  await cdp().send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
  window.focus();
  const screen = await render(<RowActionsMenu actions={menuActions} />);
  return { screen, trigger: screen.getByRole("button", { name: "Más acciones" }) };
}

test("offers a single button named Más acciones that starts closed", async () => {
  const { screen, trigger } = await renderMenu();

  await expect.element(trigger).toBeVisible();
  await expect.element(trigger).toHaveAttribute("aria-haspopup", "true");
  await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("menu").elements()).toHaveLength(0);
});

test("looks like the table's bordered icon button, 38x38px with an ellipsis glyph", async () => {
  const { trigger } = await renderMenu();
  const button = trigger.element() as HTMLElement;

  const rect = button.getBoundingClientRect();
  expect(rect.width).toBeGreaterThan(37);
  expect(rect.width).toBeLessThan(39);
  expect(rect.height).toBeGreaterThan(37);
  expect(rect.height).toBeLessThan(39);
  const style = getComputedStyle(button);
  expect(style.borderRadius).toBe("8px");
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.borderColor).toBe(tokenRgb("border"));
  expect(button.querySelector("svg")).not.toBeNull();
});

test("opens a menu listing every action in order when pressed", async () => {
  const { screen, trigger } = await renderMenu();

  await userEvent.click(trigger);

  await expect.element(screen.getByRole("menu")).toBeVisible();
  await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
  const items = screen.getByRole("menuitem").elements();
  expect(items.map((item) => item.textContent)).toEqual(["Editar", "Duplicar", "Eliminar"]);
});

test("shows an action's icon before its label, and none when it has no icon", async () => {
  const { screen, trigger } = await renderMenu();
  await userEvent.click(trigger);

  const [edit, duplicate] = screen.getByRole("menuitem").elements() as HTMLElement[];

  expect(edit?.querySelector("svg")).not.toBeNull();
  expect(duplicate?.querySelector("svg")).toBeNull();
});

test.each(["{Enter}", " ", "{ArrowDown}"])(
  "opens with the keyboard key %j and focuses the first action",
  async (key) => {
    const { screen, trigger } = await renderMenu();
    (trigger.element() as HTMLElement).focus();

    await userEvent.keyboard(key);

    await expect.element(screen.getByRole("menuitem", { name: "Editar" })).toHaveFocus();
  },
);

test("focuses the first enabled action when the first one is disabled", async () => {
  const { screen, trigger } = await renderMenu(actions([{ disabledReason: "Ya está editado" }]));
  (trigger.element() as HTMLElement).focus();

  await userEvent.keyboard("{Enter}");

  await expect.element(screen.getByRole("menuitem", { name: "Duplicar" })).toHaveFocus();
});

test("calls the chosen action once and closes the menu", async () => {
  const onAction = vi.fn();
  const { screen, trigger } = await renderMenu(actions([{}, { onAction }]));
  await userEvent.click(trigger);

  await userEvent.click(screen.getByRole("menuitem", { name: "Duplicar" }));

  expect(onAction).toHaveBeenCalledTimes(1);
  await expect.poll(() => screen.getByRole("menu").elements()).toHaveLength(0);
});

test("chooses the focused action with Enter", async () => {
  const onAction = vi.fn();
  const { trigger } = await renderMenu(actions([{ onAction }]));
  (trigger.element() as HTMLElement).focus();
  await userEvent.keyboard("{Enter}");

  await userEvent.keyboard("{Enter}");

  expect(onAction).toHaveBeenCalledTimes(1);
});

test("closes on Escape and returns focus to the trigger", async () => {
  const { screen, trigger } = await renderMenu();
  (trigger.element() as HTMLElement).focus();
  await userEvent.keyboard("{Enter}");

  await userEvent.keyboard("{Escape}");

  await expect.poll(() => screen.getByRole("menu").elements()).toHaveLength(0);
  await expect.element(trigger).toHaveFocus();
});

test("shows why a disabled action is disabled, announces it disabled and describes it by the reason", async () => {
  const { screen, trigger } = await renderMenu(
    actions([{}, { disabledReason: "Falta stock para duplicar" }]),
  );
  await userEvent.click(trigger);

  const item = screen.getByRole("menuitem", { name: "Duplicar" });
  const reason = screen.getByText("Falta stock para duplicar");

  await expect.element(reason).toBeVisible();
  await expect.element(item).toHaveAttribute("aria-disabled", "true");
  const describedBy = (item.element() as HTMLElement).getAttribute("aria-describedby");
  expect(describedBy).not.toBeNull();
  expect((reason.element() as HTMLElement).id).toBe(describedBy);
});

test("does nothing and keeps the menu open when a disabled action is chosen", async () => {
  const onAction = vi.fn();
  const { screen, trigger } = await renderMenu(
    actions([{}, { onAction, disabledReason: "Falta stock para duplicar" }]),
  );
  await userEvent.click(trigger);

  await userEvent.click(screen.getByRole("menuitem", { name: "Duplicar" }), { force: true });

  expect(onAction).not.toHaveBeenCalled();
  await expect.element(screen.getByRole("menu")).toBeVisible();
});

test("skips a disabled action when moving through the menu with the arrow keys", async () => {
  const { screen, trigger } = await renderMenu(actions([{}, { disabledReason: "No disponible" }]));
  (trigger.element() as HTMLElement).focus();
  await userEvent.keyboard("{Enter}");

  await userEvent.keyboard("{ArrowDown}");

  await expect.element(screen.getByRole("menuitem", { name: "Eliminar" })).toHaveFocus();
});

test("shows a destructive action's label and icon in the error colour, and others in the text colour", async () => {
  const { screen, trigger } = await renderMenu(actions([{}, {}, { destructive: true }]));
  await userEvent.click(trigger);

  const destructive = screen.getByRole("menuitem", { name: "Eliminar" }).element() as HTMLElement;
  const regular = screen.getByRole("menuitem", { name: "Editar" }).element() as HTMLElement;
  const colorOf = (element: Element | null) => getComputedStyle(element as Element).color;

  expect(colorOf(screen.getByText("Eliminar").element())).toBe(tokenRgb("error"));
  expect(colorOf(destructive.querySelector("svg"))).toBe(tokenRgb("error"));
  expect(colorOf(screen.getByText("Editar").element())).toBe(tokenRgb("text"));
  expect(colorOf(regular.querySelector("svg"))).toBe(tokenRgb("text"));
});

test("shows its name as a tooltip when hovered", async () => {
  const { screen, trigger } = await renderMenu();

  await userEvent.hover(trigger);

  await expect.element(screen.getByRole("tooltip")).toHaveTextContent("Más acciones");
});

test("shows its name as a tooltip when reached by keyboard", async () => {
  const { screen, trigger } = await renderMenu();

  await userEvent.tab();

  await expect.element(trigger).toHaveFocus();
  await expect.element(screen.getByRole("tooltip")).toHaveTextContent("Más acciones");
});

test("has no accessibility violations closed", async () => {
  const { screen } = await renderMenu();

  await expectNoAccessibilityViolations(screen.container);
});

test("has no accessibility violations open, with a disabled and a destructive action", async () => {
  const { trigger } = await renderMenu(
    actions([{}, { disabledReason: "Falta stock para duplicar" }, { destructive: true }]),
  );
  await userEvent.click(trigger);

  // The reason is the item's description, not part of its name, which is the pattern for a menu
  // item with secondary text; this rule would demand the reason in the name as well.
  await expectNoAccessibilityViolations(document.body, {
    rules: { "label-content-name-mismatch": { enabled: false } },
  });
});

test("accepts one or more actions and refuses none", () => {
  expectTypeOf<readonly [RowMenuAction]>().toExtend<RowMenuActions>();
  expectTypeOf<readonly [RowMenuAction, RowMenuAction]>().toExtend<RowMenuActions>();
  expectTypeOf<readonly []>().not.toExtend<RowMenuActions>();
  expectTypeOf<RowMenuAction[]>().not.toExtend<RowMenuActions>();
});

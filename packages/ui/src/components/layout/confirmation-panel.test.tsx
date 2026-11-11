import { LogOut, Undo2 } from "lucide-react";
import type { ReactNode } from "react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { ConfirmationPanel, type ConfirmationPanelProps } from "./confirmation-panel";

function panel(overrides: Partial<ConfirmationPanelProps> = {}) {
  return (
    <div style={{ display: "flex", height: "600px", justifyContent: "flex-end" }}>
      <ConfirmationPanel
        title="¿Salir de la caja?"
        icon={<LogOut />}
        fieldLabel="Persona"
        value="Lucas"
        actionLabel="Salir"
        actionIcon={<LogOut />}
        onClose={() => {}}
        onConfirm={() => {}}
        {...overrides}
      />
    </div>
  );
}

test("is a complementary landmark named by its title", async () => {
  const screen = await render(panel());

  await expect
    .element(screen.getByRole("complementary", { name: "¿Salir de la caja?" }))
    .toBeVisible();
  await expect.element(screen.getByRole("heading", { name: "¿Salir de la caja?" })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("shows the field label and its value large", async () => {
  const screen = await render(panel());

  await expect.element(screen.getByText("Persona")).toBeVisible();
  const value = screen.getByText("Lucas").element();
  expect(getComputedStyle(value).fontSize).toBe("48px");
});

test("shows the Esc keycap at the top right as a button that closes the panel", async () => {
  const onClose = vi.fn();
  const screen = await render(panel({ onClose }));
  const panelBox = screen.getByRole("complementary").element().getBoundingClientRect();
  const close = screen.getByRole("button", { name: "Cerrar con Esc" });
  const keycap = close.element().querySelector("kbd");

  expect(keycap?.textContent).toBe("Esc");
  expect(panelBox.right - close.element().getBoundingClientRect().right).toBeLessThan(40);
  expect(close.element().getBoundingClientRect().top - panelBox.top).toBeLessThan(40);
  await userEvent.click(close);

  expect(onClose).toHaveBeenCalledOnce();
});

test("shows the action at the bottom with the Enter keycap and confirms when pressed", async () => {
  const onConfirm = vi.fn();
  const screen = await render(panel({ onConfirm }));
  const panelBox = screen.getByRole("complementary").element().getBoundingClientRect();
  const action = screen.getByRole("button", { name: "Salir" });

  expect(action.element().querySelector("kbd")?.textContent).toBe("Enter");
  expect(panelBox.bottom - action.element().getBoundingClientRect().bottom).toBeCloseTo(32, 0);
  await userEvent.click(action);

  expect(onConfirm).toHaveBeenCalledOnce();
});

test("shows the action's icon to the left of its label", async () => {
  const screen = await render(panel());
  const action = screen.getByRole("button", { name: "Salir" }).element();
  const iconRect = (action.querySelector("svg") as SVGSVGElement).getBoundingClientRect();
  const labelRect = (action.querySelector("span.truncate") as HTMLElement).getBoundingClientRect();

  expect(iconRect.right).toBeLessThanOrEqual(labelRect.left);
});

test("does not confirm or close until a button is pressed", async () => {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  await render(panel({ onClose, onConfirm }));

  expect(onClose).not.toHaveBeenCalled();
  expect(onConfirm).not.toHaveBeenCalled();
});

test("paints the icon circle in the warning tone only when asked to", async () => {
  const neutral = await render(panel());
  const neutralCircle = neutral.getByRole("heading").element().previousElementSibling as Element;
  const neutralColor = getComputedStyle(neutralCircle).backgroundColor;
  await neutral.unmount();

  const warning = await render(panel({ tone: "warning" }));
  const warningCircle = warning.getByRole("heading").element().previousElementSibling as Element;

  expect(getComputedStyle(warningCircle).backgroundColor).not.toBe(neutralColor);
});

test("lists its details under the value as label and value rows", async () => {
  const screen = await render(
    panel({
      details: [
        { label: "Cobrado a las", value: "14:55" },
        { label: "Pasa a ser", value: "Reembolso pendiente" },
      ],
    }),
  );

  await expect.element(screen.getByText("Cobrado a las")).toBeVisible();
  await expect.element(screen.getByText("14:55")).toBeVisible();
  await expect.element(screen.getByText("Pasa a ser")).toBeVisible();
  await expect.element(screen.getByText("Reembolso pendiente")).toBeVisible();
});

test("shows a notice as an error alert and none when it has no notice", async () => {
  const without = await render(panel());
  expect(without.container.querySelector('[role="alert"]')).toBeNull();
  await without.unmount();

  const screen = await render(panel({ notice: "No hay conexión con la nube." }));

  await expect.element(screen.getByRole("alert")).toHaveTextContent("No hay conexión con la nube.");
});

test("disables the action and the close button while busy", async () => {
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  const screen = await render(panel({ busy: true, onClose, onConfirm }));

  await expect.element(screen.getByRole("button", { name: "Salir" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Cerrar con Esc" })).toBeDisabled();
});

test("leaves the action and the close button enabled when not busy", async () => {
  const screen = await render(panel({ icon: <Undo2 /> }));

  await expect.element(screen.getByRole("button", { name: "Salir" })).toBeEnabled();
  await expect.element(screen.getByRole("button", { name: "Cerrar con Esc" })).toBeEnabled();
});

test("does not accept a panel without its screen's text", () => {
  expectTypeOf<{ children: ReactNode }>().not.toExtend<ConfirmationPanelProps>();
  expectTypeOf<
    Omit<ConfirmationPanelProps, "actionLabel">
  >().not.toExtend<ConfirmationPanelProps>();
  expectTypeOf<Omit<ConfirmationPanelProps, "title">>().not.toExtend<ConfirmationPanelProps>();
  expectTypeOf<Omit<ConfirmationPanelProps, "fieldLabel">>().not.toExtend<ConfirmationPanelProps>();
  expectTypeOf<Omit<ConfirmationPanelProps, "value">>().not.toExtend<ConfirmationPanelProps>();
});

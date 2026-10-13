import { expect, expectTypeOf, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { NotificationPanel, type NotificationPanelProps } from "./notification-panel";
import { StatusIndicatorButton } from "./status-indicator-button";

function renderPanel() {
  return render(
    <NotificationPanel
      title="Avisos de esta caja"
      trigger={<StatusIndicatorButton tone="warning">2 avisos</StatusIndicatorButton>}
    >
      <p>Primer aviso</p>
      <p>Segundo aviso</p>
    </NotificationPanel>,
  );
}

test("keeps the panel closed until the trigger is pressed", async () => {
  const screen = await renderPanel();

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "2 avisos" }))
    .toHaveAttribute("aria-expanded", "false");
});

test("opens a dialog named by the title with its content when the trigger is pressed", async () => {
  const screen = await renderPanel();

  await userEvent.click(screen.getByRole("button", { name: "2 avisos" }));

  await expect.element(screen.getByRole("dialog", { name: "Avisos de esta caja" })).toBeVisible();
  await expect.element(screen.getByText("Primer aviso")).toBeVisible();
  await expect.element(screen.getByText("Segundo aviso")).toBeVisible();
  await expect
    .element(screen.getByRole("button", { name: "2 avisos" }))
    .toHaveAttribute("aria-expanded", "true");
});

test("shows the title as a 16px bold heading in a 420px panel with a border and rounded corners", async () => {
  const screen = await renderPanel();

  await userEvent.click(screen.getByRole("button", { name: "2 avisos" }));

  const heading = screen.getByRole("heading", { name: "Avisos de esta caja" }).element();
  expect(getComputedStyle(heading).fontSize).toBe("16px");
  expect(getComputedStyle(heading).fontWeight).toBe("700");
  const panel = screen.getByRole("dialog").element().parentElement as HTMLElement;
  const style = getComputedStyle(panel);
  expect(panel.getBoundingClientRect().width).toBe(420);
  expect(style.backgroundColor).toBe(tokenRgb("surface"));
  expect(style.borderTopWidth).toBe("1px");
  expect(style.borderTopLeftRadius).toBe("12px");
  expect(style.paddingTop).toBe("16px");
  expect(style.boxShadow).not.toBe("none");
});

test("opens below its trigger", async () => {
  const screen = await renderPanel();
  const trigger = screen.getByRole("button", { name: "2 avisos" });

  await userEvent.click(trigger);

  const panel = screen.getByRole("dialog").element().parentElement as HTMLElement;
  expect(panel.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    trigger.element().getBoundingClientRect().bottom,
  );
});

test("closes with its close button", async () => {
  const screen = await renderPanel();
  await userEvent.click(screen.getByRole("button", { name: "2 avisos" }));

  await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
});

test("closes with Escape", async () => {
  const screen = await renderPanel();
  await userEvent.click(screen.getByRole("button", { name: "2 avisos" }));

  await userEvent.keyboard("{Escape}");

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
});

test("closes when pressing outside of it", async () => {
  const screen = await renderPanel();
  await userEvent.click(screen.getByRole("button", { name: "2 avisos" }));

  await userEvent.click(document.body);

  await expect.element(screen.getByRole("dialog")).not.toBeInTheDocument();
});

test("has no accessibility violations while open", async () => {
  const screen = await renderPanel();
  await userEvent.click(screen.getByRole("button", { name: "2 avisos" }));

  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept a panel without a title", () => {
  expectTypeOf<{
    trigger: React.ReactNode;
    children: React.ReactNode;
  }>().not.toExtend<NotificationPanelProps>();
});

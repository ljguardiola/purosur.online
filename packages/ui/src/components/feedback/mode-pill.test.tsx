import { Eye } from "lucide-react";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { ModePill } from "./mode-pill";

test("is a button named by its label that shows the Esc key", async () => {
  const screen = await render(<ModePill icon={<Eye />} label="Consulta" onExit={() => {}} />);

  const button = screen.getByRole("button", { name: "Consulta" });
  await expect.element(button).toBeVisible();
  expect(button.element().querySelector("kbd")?.textContent).toBe("Esc");
  expect(button.element().querySelector("svg")).not.toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("calls onExit when clicked", async () => {
  const onExit = vi.fn();
  const screen = await render(<ModePill icon={<Eye />} label="Consulta" onExit={onExit} />);

  await screen.getByRole("button", { name: "Consulta" }).click();

  expect(onExit).toHaveBeenCalledTimes(1);
});

test("draws a filled brown pill with light text", async () => {
  const screen = await render(<ModePill icon={<Eye />} label="Consulta" onExit={() => {}} />);

  const style = getComputedStyle(screen.getByRole("button").element());
  expect(style.backgroundColor).toBe(tokenRgb("border-accent"));
  expect(style.color).toBe(tokenRgb("text-inverse"));
});

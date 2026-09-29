import { ShieldX } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { LoadFailure, type LoadFailureProps } from "./load-failure";

test("announces the failure and offers Reintentar", async () => {
  const screen = await render(
    <LoadFailure
      icon={<ShieldX />}
      title="No pudimos abrir los productos"
      description="Probá de nuevo en unos minutos."
      onRetry={() => {}}
    />,
  );

  await expect
    .element(screen.getByRole("alert"))
    .toHaveTextContent("No pudimos abrir los productos Probá de nuevo en unos minutos.");
  await expect.element(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("calls onRetry once when Reintentar is pressed", async () => {
  const onRetry = vi.fn();
  const screen = await render(
    <LoadFailure
      icon={<ShieldX />}
      title="Falló"
      description="Probá de nuevo."
      onRetry={onRetry}
    />,
  );

  await screen.getByRole("button", { name: "Reintentar" }).click();

  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("stacks the notice above the button, both starting at the left edge", async () => {
  const screen = await render(
    <LoadFailure
      icon={<ShieldX />}
      title="Falló"
      description="Probá de nuevo."
      onRetry={() => {}}
    />,
  );

  const button = screen.getByRole("button", { name: "Reintentar" }).element();
  const notice = screen.getByRole("alert").element().parentElement as HTMLElement;
  const noticeRect = notice.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  expect(buttonRect.top).toBe(noticeRect.bottom + 16);
  expect(buttonRect.left).toBe(noticeRect.left);
  expect(buttonRect.width).toBeLessThan(noticeRect.width);
});

test("requires an icon, a title, a description and a retry", () => {
  expectTypeOf<{
    icon: LoadFailureProps["icon"];
    title: string;
    description: string;
  }>().not.toExtend<LoadFailureProps>();
});

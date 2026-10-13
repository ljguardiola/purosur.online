import { ShieldX } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import { Button } from "../forms/button";
import { LoadFailure, type LoadFailureProps } from "./load-failure";
import { Pill } from "./pill";

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

test("requires an icon, a title and a retry", () => {
  expectTypeOf<{
    icon: LoadFailureProps["icon"];
    title: string;
  }>().not.toExtend<LoadFailureProps>();
  expectTypeOf<{
    icon: LoadFailureProps["icon"];
    onRetry: () => void;
  }>().not.toExtend<LoadFailureProps>();
  expectTypeOf<{
    title: string;
    onRetry: () => void;
  }>().not.toExtend<LoadFailureProps>();
  expectTypeOf<{
    icon: LoadFailureProps["icon"];
    title: string;
    onRetry: () => void;
  }>().toExtend<LoadFailureProps>();
});

test("announces just the title when there is no description", async () => {
  const screen = await render(
    <LoadFailure icon={<ShieldX />} title="No se pudo mostrar la pantalla" onRetry={() => {}} />,
  );

  const region = screen.getByRole("alert").element();
  await expect.poll(() => region.textContent).toBe("No se pudo mostrar la pantalla");
});

test("draws the screen variant's Reintentar as a primary large button", async () => {
  const screen = await render(
    <LoadFailure
      variant="screen"
      icon={<ShieldX />}
      title="No se pudo mostrar la pantalla"
      onRetry={() => {}}
    />,
  );
  const button = screen.getByRole("button", { name: "Reintentar" }).element() as HTMLElement;
  const style = getComputedStyle(button);

  expect(style.height).toBe("56px");
  expect(style.fontSize).toBe("18px");
  expect(style.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");

  const reference = await render(<Button size="large">Reference</Button>);
  const referenceStyle = getComputedStyle(
    reference.getByRole("button", { name: "Reference" }).element(),
  );
  expect(style.backgroundColor).toBe(referenceStyle.backgroundColor);
  expect(style.color).toBe(referenceStyle.color);
  expect(style.backgroundColor).not.toBe(tokenRgb("surface"));
});

test("stretches the screen variant's button to the notice's width, 16px below it", async () => {
  const screen = await render(
    <LoadFailure
      variant="screen"
      icon={<ShieldX />}
      title="No se pudo mostrar la pantalla"
      onRetry={() => {}}
    />,
  );

  const button = screen.getByRole("button", { name: "Reintentar" }).element();
  const notice = screen.getByRole("alert").element().parentElement as HTMLElement;
  const noticeRect = notice.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  expect(buttonRect.top).toBe(noticeRect.bottom + 16);
  expect(buttonRect.left).toBe(noticeRect.left);
  expect(buttonRect.width).toBe(noticeRect.width);
});

test("keeps the section variant's medium secondary button as wide as its label", async () => {
  const screen = await render(
    <LoadFailure
      variant="section"
      icon={<ShieldX />}
      title="Falló"
      description="Probá de nuevo."
      onRetry={() => {}}
    />,
  );

  const button = screen.getByRole("button", { name: "Reintentar" }).element() as HTMLElement;
  const notice = screen.getByRole("alert").element().parentElement as HTMLElement;
  expect(getComputedStyle(button).height).toBe("48px");
  expect(button.getBoundingClientRect().width).toBeLessThan(notice.getBoundingClientRect().width);
});

test("has no accessibility violations in the screen variant", async () => {
  const screen = await render(
    <LoadFailure
      variant="screen"
      icon={<ShieldX />}
      title="No se pudo mostrar la pantalla"
      onRetry={() => {}}
    />,
  );

  await expectNoAccessibilityViolations(screen.container);
});

function renderPill(onRetry: () => void = () => {}) {
  return render(
    <main>
      <LoadFailure
        variant="pill"
        icon={<ShieldX />}
        title="Demasiadas solicitudes"
        description="Probá de nuevo en 30 segundos."
        onRetry={onRetry}
      />
    </main>,
  );
}

test("draws the pill variant as an error pill that reads its title and Reintentar", async () => {
  const screen = await renderPill();

  const button = screen
    .getByRole("button", { name: "Demasiadas solicitudes. Reintentar" })
    .element() as HTMLElement;
  expect(button.textContent).toBe("Demasiadas solicitudesReintentar");
  expect(button.querySelector("svg")?.closest("[aria-hidden='true']")).not.toBeNull();

  const reference = await render(
    <Pill tone="error" icon={<ShieldX />}>
      Reference
    </Pill>,
  );
  const pill = reference.getByText("Reference").element() as HTMLElement;
  for (const property of ["height", "color", "backgroundColor", "borderRadius"] as const) {
    expect(getComputedStyle(button)[property], property).toBe(getComputedStyle(pill)[property]);
  }
});

test("opens the pill variant's description as a tooltip when hovered", async () => {
  const screen = await renderPill();

  await userEvent.hover(screen.getByRole("button"));

  await expect
    .element(screen.getByRole("tooltip"))
    .toHaveTextContent("Probá de nuevo en 30 segundos.");
});

test("calls onRetry when the pill variant is pressed by pointer or by keyboard", async () => {
  const onRetry = vi.fn();
  const screen = await renderPill(onRetry);

  await userEvent.click(screen.getByRole("button", { name: "Demasiadas solicitudes. Reintentar" }));
  expect(onRetry).toHaveBeenCalledTimes(1);

  await userEvent.keyboard("{Enter}");
  expect(onRetry).toHaveBeenCalledTimes(2);
});

test("opens the pill variant's description as a tooltip that describes it when reached by keyboard", async () => {
  const screen = await renderPill();
  const button = screen.getByRole("button", { name: "Demasiadas solicitudes. Reintentar" });

  await userEvent.tab();

  expect(document.activeElement).toBe(button.element());
  await expect
    .element(screen.getByRole("tooltip"))
    .toHaveTextContent("Probá de nuevo en 30 segundos.");
  await expect.element(button).toHaveAccessibleDescription("Probá de nuevo en 30 segundos.");
});

test("draws the pill variant without a tooltip when there is no description", async () => {
  const screen = await render(
    <LoadFailure variant="pill" icon={<ShieldX />} title="Falló" onRetry={() => {}} />,
  );
  const button = screen.getByRole("button", { name: "Falló. Reintentar" });

  await userEvent.hover(button);
  await userEvent.tab();

  expect(document.activeElement).toBe(button.element());
  expect(screen.getByRole("tooltip").query()).toBeNull();
});

test("has no accessibility violations in the pill variant, with its tooltip closed or open", async () => {
  const screen = await renderPill();
  await expectNoAccessibilityViolations(screen.container);

  await userEvent.tab();
  await expect.element(screen.getByRole("tooltip")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

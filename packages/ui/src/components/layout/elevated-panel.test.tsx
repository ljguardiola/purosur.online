import { ShieldCheck } from "lucide-react";
import { expect, expectTypeOf, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { paintedBoxShadowLayers, tokenRgb } from "../../test/token-colors";
import { ElevatedPanel, type ElevatedPanelProps } from "./elevated-panel";

type Screen = Awaited<ReturnType<typeof render>>;

function panelOf(screen: Screen): HTMLElement {
  return screen.container.firstElementChild as HTMLElement;
}

function badgeOf(screen: Screen): HTMLElement {
  return screen.getByRole("heading").element().previousElementSibling as HTMLElement;
}

function renderPanel(overrides: Partial<ElevatedPanelProps> = {}) {
  return render(
    <ElevatedPanel
      eyebrow="Notebook nueva"
      title="Dar de alta esta caja"
      icon={<ShieldCheck />}
      {...overrides}
    >
      <p>Cuerpo</p>
    </ElevatedPanel>,
  );
}

test("shows the eyebrow in capitals, the title as the heading and the body", async () => {
  const screen = await renderPanel();

  await expect.element(screen.getByText("Notebook nueva")).toBeVisible();
  expect(getComputedStyle(screen.getByText("Notebook nueva").element()).textTransform).toBe(
    "uppercase",
  );
  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Dar de alta esta caja" }))
    .toBeVisible();
  await expect.element(screen.getByText("Cuerpo")).toBeVisible();
  await expectNoAccessibilityViolations(screen.container);
});

test("lifts the card off the page with a shadow, on the surface background", async () => {
  const screen = await renderPanel();

  expect(getComputedStyle(panelOf(screen)).backgroundColor).toBe(tokenRgb("surface"));
  expect(paintedBoxShadowLayers(panelOf(screen))).not.toEqual([]);
});

test("draws the icon in a 36px round badge before the title, hidden from assistive technology", async () => {
  const screen = await renderPanel();

  const badge = badgeOf(screen);
  const box = badge.getBoundingClientRect();
  expect(box.width).toBe(36);
  expect(box.height).toBe(36);
  expect(getComputedStyle(badge).borderRadius).not.toBe("0px");
  expect(badge.getAttribute("aria-hidden")).toBe("true");
  expect(badge.querySelector("svg")).not.toBeNull();
});

test("tints the badge with the subtle info tone unless told otherwise", async () => {
  const screen = await renderPanel();

  expect(getComputedStyle(badgeOf(screen)).backgroundColor).toBe(tokenRgb("info-subtle"));
});

test.each([
  ["success", "success-subtle"],
  ["warning", "warning-subtle"],
  ["error", "error-subtle"],
] as const)("tints the badge with the subtle %s tone when asked", async (tone, token) => {
  const screen = await renderPanel({ tone });

  expect(getComputedStyle(badgeOf(screen)).backgroundColor).toBe(tokenRgb(token));
});

test("offers no Esc key unless it is given one", async () => {
  const screen = await renderPanel();

  expect(screen.container.querySelector("kbd")).toBeNull();
  await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
});

test("shows an Esc keycap button named by the app at the right of the title row", async () => {
  const onPress = vi.fn();
  const screen = await renderPanel({ escapeKey: { name: "Volver con Esc", onPress } });

  const button = screen.getByRole("button", { name: "Volver con Esc", exact: true });
  const element = button.element() as HTMLElement;
  expect(element.querySelector("kbd")?.textContent).toBe("Esc");
  const heading = screen.getByRole("heading").element().getBoundingClientRect();
  const box = element.getBoundingClientRect();
  expect(box.left).toBeGreaterThan(heading.left);
  const panel = panelOf(screen);
  const contentRight =
    panel.getBoundingClientRect().right - parseFloat(getComputedStyle(panel).paddingRight);
  expect(Math.abs(box.right - contentRight)).toBeLessThanOrEqual(4);

  await userEvent.click(button);
  expect(onPress).toHaveBeenCalledOnce();
  await expectNoAccessibilityViolations(screen.container);
});

test("does not accept an Esc key without the name the app gives it", () => {
  expectTypeOf<{
    eyebrow: string;
    title: string;
    icon: ElevatedPanelProps["icon"];
    children: string;
    escapeKey: { onPress: () => void };
  }>().not.toExtend<ElevatedPanelProps>();
});

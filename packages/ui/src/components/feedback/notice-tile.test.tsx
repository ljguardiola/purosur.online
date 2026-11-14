import { Clock } from "lucide-react";
import { expect, expectTypeOf, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenRgb } from "../../test/token-colors";
import type { Icon } from "../shared/icon";
import type { NoticeTone } from "../shared/tone";
import { NoticeTile, type NoticeTileProps } from "./notice-tile";

const tones: Record<NoticeTone, { surface: string; strong: string }> = {
  info: { surface: "info-subtle", strong: "info-strong" },
  success: { surface: "success-subtle", strong: "success-strong" },
  warning: { surface: "warning-subtle", strong: "warning-strong" },
  error: { surface: "error-subtle", strong: "error-strong" },
};

function renderTile(props: Partial<NoticeTileProps> = {}) {
  return render(
    <NoticeTile
      tone="warning"
      icon={<Clock />}
      title="Reloj de la caja desajustado"
      subtitle="Desde 04/11 · 14:20"
      focused={false}
      {...props}
    />,
  );
}

function tileOf(screen: Awaited<ReturnType<typeof renderTile>>) {
  return screen.container.firstElementChild as HTMLElement;
}

test("renders the caller's title, subtitle and icon", async () => {
  const screen = await renderTile();

  await expect.element(screen.getByText("Reloj de la caja desajustado").first()).toBeVisible();
  await expect.element(screen.getByText("Desde 04/11 · 14:20").first()).toBeVisible();
  expect(tileOf(screen).querySelector("svg")).not.toBeNull();
});

test("does not accept a tile without a title or a subtitle", () => {
  expectTypeOf<{
    tone: "warning";
    icon: Icon;
    subtitle: string;
    focused: boolean;
  }>().not.toExtend<NoticeTileProps>();
  expectTypeOf<{
    tone: "warning";
    icon: Icon;
    title: string;
    focused: boolean;
  }>().not.toExtend<NoticeTileProps>();
});

test("draws every tone's tinted surface, strong title and icon", async () => {
  for (const [tone, expected] of Object.entries(tones) as [
    NoticeTone,
    (typeof tones)[NoticeTone],
  ][]) {
    const screen = await renderTile({ tone, title: `Title ${tone}` });
    const tile = tileOf(screen);
    const title = screen.getByText(`Title ${tone}`).first().element();

    expect(getComputedStyle(tile).backgroundColor, `${tone} surface`).toBe(
      tokenRgb(expected.surface),
    );
    expect(getComputedStyle(title).color, `${tone} title`).toBe(tokenRgb(expected.strong));
    expect(getComputedStyle(tile.querySelector("svg") as Element).color, `${tone} icon`).toBe(
      tokenRgb(expected.strong),
    );
    expect(getComputedStyle(title).fontWeight, `${tone} weight`).toBe("700");
  }
});

test("draws a dark 2px border only when focused, without changing its size", async () => {
  const unfocused = await renderTile({ focused: false });
  const unfocusedTile = tileOf(unfocused);
  const unfocusedBox = unfocusedTile.getBoundingClientRect();
  const unfocusedStyle = getComputedStyle(unfocusedTile);
  expect(unfocusedStyle.borderTopWidth).toBe("2px");
  expect(unfocusedStyle.borderTopColor).toBe("rgba(0, 0, 0, 0)");
  await unfocused.unmount();

  const focused = await renderTile({ focused: true });
  const focusedTile = tileOf(focused);
  expect(getComputedStyle(focusedTile).borderTopWidth).toBe("2px");
  expect(getComputedStyle(focusedTile).borderTopColor).toBe(tokenRgb("focus"));
  expect(focusedTile.getBoundingClientRect().height).toBe(unfocusedBox.height);
});

test("marks the focused tile as the current one", async () => {
  const focused = await renderTile({ focused: true });
  expect(tileOf(focused).getAttribute("aria-current")).toBe("true");
  await focused.unmount();

  const unfocused = await renderTile({ focused: false });
  expect(tileOf(unfocused).hasAttribute("aria-current")).toBe(false);
});

test("shows the description and what to do only when focused", async () => {
  const extras = { description: "La hora difiere de la nube.", whatToDo: "Ajustá el reloj." };
  const unfocused = await renderTile({ ...extras, focused: false });
  expect(unfocused.getByText("La hora difiere de la nube.").elements()).toHaveLength(0);
  expect(unfocused.getByText("Ajustá el reloj.").elements()).toHaveLength(0);
  await unfocused.unmount();

  const focused = await renderTile({ ...extras, focused: true });
  await expect.element(focused.getByText("La hora difiere de la nube.").first()).toBeVisible();
  await expect.element(focused.getByText("Ajustá el reloj.").first()).toBeVisible();
  const whatToDo = focused.getByText("Ajustá el reloj.").first().element();
  expect(getComputedStyle(whatToDo).fontWeight).toBe("600");
});

test("exposes the notice's text to assistive technology exactly once", async () => {
  const screen = await renderTile({ description: "La hora difiere.", focused: true });

  expect(screen.getByRole("paragraph").elements()).toHaveLength(0);
  const region = screen.container.querySelector('[role="status"], [role="alert"]') as HTMLElement;
  await expect
    .poll(() => region.textContent)
    .toBe("Reloj de la caja desajustado Desde 04/11 · 14:20 La hora difiere.");
});

test("announces an error tile assertively", async () => {
  const screen = await renderTile({ tone: "error" });

  expect(screen.container.querySelector('[role="alert"]')).not.toBeNull();
});

test("has no accessibility violations in any tone, focused or not", async () => {
  for (const tone of Object.keys(tones) as NoticeTone[]) {
    for (const focused of [true, false]) {
      const screen = await renderTile({
        tone,
        focused,
        description: "Detalle",
        whatToDo: "Acción",
      });
      await expectNoAccessibilityViolations(screen.container);
      await screen.unmount();
    }
  }
});

import { Flag } from "lucide-react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { SectionNavButton } from "./section-nav-button";
import { SectionNavItem } from "./section-nav-item";

const drawnProperties = [
  "display",
  "alignItems",
  "width",
  "height",
  "paddingLeft",
  "paddingRight",
  "borderRadius",
  "backgroundColor",
  "columnGap",
] as const;

test("renders as a button named by its own label, with its icon hidden from assistive technology", async () => {
  const screen = await render(
    <SectionNavButton label="Primeros pasos" icon={<Flag />} active={false} onPress={vi.fn()} />,
  );

  const button = screen
    .getByRole("button", { name: "Primeros pasos" })
    .element() as HTMLButtonElement;
  expect(button.getAttribute("type")).toBe("button");
  expect(button.querySelector("svg")?.closest("[aria-hidden='true']")).not.toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("activates by pointer and by keyboard", async () => {
  const onPress = vi.fn();
  const screen = await render(
    <SectionNavButton label="Primeros pasos" icon={<Flag />} active={false} onPress={onPress} />,
  );

  await userEvent.click(screen.getByRole("button", { name: "Primeros pasos" }));
  await userEvent.keyboard("{Enter}");

  expect(onPress).toHaveBeenCalledTimes(2);
});

test("marks the active button with aria-current and leaves an inactive one unmarked", async () => {
  const screen = await render(
    <>
      <SectionNavButton label="Actual" icon={<Flag />} active onPress={vi.fn()} />
      <SectionNavButton label="Otro" icon={<Flag />} active={false} onPress={vi.fn()} />
    </>,
  );

  await expect
    .element(screen.getByRole("button", { name: "Actual" }))
    .toHaveAttribute("aria-current", "page");
  await expect
    .element(screen.getByRole("button", { name: "Otro" }))
    .not.toHaveAttribute("aria-current");
});

test("draws like the section link, active or not, its label included", async () => {
  for (const active of [true, false]) {
    const screen = await render(
      <div className="flex flex-col p-2">
        <SectionNavButton label="Botón" icon={<Flag />} active={active} onPress={vi.fn()} />
        <SectionNavItem label="Enlace" icon={<Flag />} active={active} href="/help" />
      </div>,
    );
    const button = screen.getByRole("button", { name: "Botón" }).element() as HTMLElement;
    const link = screen.getByRole("link", { name: "Enlace" }).element() as HTMLElement;
    const context = active ? "active" : "inactive";

    for (const property of drawnProperties) {
      expect(getComputedStyle(button)[property], ` `).toBe(
        getComputedStyle(link)[property],
      );
    }
    const buttonLabel = getComputedStyle(screen.getByText("Botón").element());
    const linkLabel = getComputedStyle(screen.getByText("Enlace").element());
    expect(buttonLabel.color, ` label color`).toBe(linkLabel.color);
    expect(buttonLabel.fontSize, ` label size`).toBe(linkLabel.fontSize);
    expect(buttonLabel.fontWeight, ` label weight`).toBe(linkLabel.fontWeight);
    await screen.unmount();
  }
});

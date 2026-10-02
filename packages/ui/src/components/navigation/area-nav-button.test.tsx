import { LifeBuoy, LogOut } from "lucide-react";
import { expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { AreaNavButton } from "./area-nav-button";
import { AreaNavItem, type AreaNavItemProps } from "./area-nav-item";

const drawnProperties = [
  "display",
  "flexDirection",
  "alignItems",
  "width",
  "height",
  "paddingTop",
  "paddingBottom",
  "borderRadius",
  "borderTopWidth",
  "backgroundColor",
  "rowGap",
] as const;

const railBackground = { dark: "bg-surface-nav", light: "bg-surface" } as const;

test("renders as a button named by its own label, with its icon hidden from assistive technology", async () => {
  const screen = await render(
    <div className="bg-surface p-2">
      <AreaNavButton
        rail="light"
        label="Salir"
        icon={<LogOut />}
        active={false}
        onPress={vi.fn()}
      />
    </div>,
  );

  const button = screen.getByRole("button", { name: "Salir" }).element() as HTMLButtonElement;
  expect(button.getAttribute("type")).toBe("button");
  expect(button.querySelector("svg")?.closest("[aria-hidden='true']")).not.toBeNull();
  await expectNoAccessibilityViolations(screen.container);
});

test("activates by pointer and by keyboard", async () => {
  const onPress = vi.fn();
  const screen = await render(
    <AreaNavButton rail="light" label="Salir" icon={<LogOut />} active={false} onPress={onPress} />,
  );
  const button = screen.getByRole("button", { name: "Salir" });

  await userEvent.click(button);
  await userEvent.keyboard("{Enter}");

  expect(onPress).toHaveBeenCalledTimes(2);
});

test("marks the active button with aria-current and leaves an inactive one unmarked", async () => {
  const screen = await render(
    <>
      <AreaNavButton rail="light" label="Inicio" icon={<LifeBuoy />} active onPress={vi.fn()} />
      <AreaNavButton
        rail="light"
        label="Salir"
        icon={<LogOut />}
        active={false}
        onPress={vi.fn()}
      />
    </>,
  );

  await expect
    .element(screen.getByRole("button", { name: "Inicio" }))
    .toHaveAttribute("aria-current", "page");
  await expect
    .element(screen.getByRole("button", { name: "Salir" }))
    .not.toHaveAttribute("aria-current");
});

test("draws like the area link of its rail, active or not, its label included", async () => {
  for (const rail of ["dark", "light"] as const) {
    for (const active of [true, false]) {
      const props: Omit<AreaNavItemProps, "label"> = { rail, active, icon: <LifeBuoy /> };
      const screen = await render(
        <div className={`${railBackground[rail]} flex flex-col p-2`}>
          <AreaNavButton {...props} label="Botón" onPress={vi.fn()} />
          <AreaNavItem {...props} label="Enlace" href="/help" />
        </div>,
      );
      const button = screen.getByRole("button", { name: "Botón" }).element() as HTMLElement;
      const link = screen.getByRole("link", { name: "Enlace" }).element() as HTMLElement;
      const context = `${rail} ${active ? "active" : "inactive"}`;

      for (const property of drawnProperties) {
        expect(getComputedStyle(button)[property], `${context} ${property}`).toBe(
          getComputedStyle(link)[property],
        );
      }
      const buttonLabel = getComputedStyle(screen.getByText("Botón").element());
      const linkLabel = getComputedStyle(screen.getByText("Enlace").element());
      expect(buttonLabel.color, `${context} label color`).toBe(linkLabel.color);
      expect(buttonLabel.fontSize, `${context} label size`).toBe(linkLabel.fontSize);
      expect(buttonLabel.fontWeight, `${context} label weight`).toBe(linkLabel.fontWeight);
      await expectNoAccessibilityViolations(screen.container);
      await screen.unmount();
    }
  }
});

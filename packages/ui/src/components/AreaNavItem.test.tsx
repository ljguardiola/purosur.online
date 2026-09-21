import { LifeBuoy } from "lucide-react";
import type { ReactNode } from "react";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../test/axe";
import { tokenBackgroundColor, tokenRgb } from "../test/token-colors";
import { AreaNavItem, type AreaNavItemProps } from "./AreaNavItem";

// The area rail always paints its own bg-brand-blue-strong behind an item (see Shell.tsx); every
// contrast assertion below needs that same real background, not the page's default surface-bone.
function Rail({ children }: { children: ReactNode }) {
  return <div className="bg-brand-blue-strong p-2">{children}</div>;
}

function renderItem(props: Omit<AreaNavItemProps, "icon">) {
  return render(
    <Rail>
      <AreaNavItem icon={<LifeBuoy />} {...props} />
    </Rail>,
  );
}

test("renders as a link naming its own label, with the icon hidden from assistive technology", async () => {
  const screen = await renderItem({ label: "Ayuda", active: false, href: "/ayuda" });

  const link = screen.getByRole("link", { name: "Ayuda" }).element() as HTMLAnchorElement;
  expect(link.getAttribute("href")).toBe("/ayuda");
  expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");

  await expectNoAccessibilityViolations(screen.container);
});

test("marks the active item with aria-current and paints it blanco over a translucent white fill", async () => {
  const screen = await renderItem({ label: "Ayuda", active: true, href: "/ayuda" });

  const link = screen.getByRole("link", { name: "Ayuda" }).element() as HTMLAnchorElement;
  expect(link.getAttribute("aria-current")).toBe("page");
  expect(getComputedStyle(link).backgroundColor).toBe(tokenBackgroundColor("surface-white-veil"));

  const label = screen.getByText("Ayuda").element();
  expect(getComputedStyle(label).color).toBe(tokenRgb("surface-white"));
  expect(getComputedStyle(label).fontWeight).toBe("700");

  await expectNoAccessibilityViolations(screen.container);
});

test("leaves an inactive item with no aria-current, painted azul-tenue with no background", async () => {
  const screen = await renderItem({ label: "Ayuda", active: false, href: "/ayuda" });

  const link = screen.getByRole("link", { name: "Ayuda" }).element() as HTMLAnchorElement;
  expect(link.hasAttribute("aria-current")).toBe(false);
  expect(getComputedStyle(link).backgroundColor).toBe("rgba(0, 0, 0, 0)");

  const label = screen.getByText("Ayuda").element();
  expect(getComputedStyle(label).color).toBe(tokenRgb("blue-soft"));
  expect(getComputedStyle(label).fontWeight).toBe("400");

  await expectNoAccessibilityViolations(screen.container);
});

test("forwards a click handler, so the app can drive its own router", async () => {
  let clicked = false;
  const screen = await renderItem({
    label: "Ayuda",
    active: false,
    href: "/ayuda",
    onClick: (event) => {
      event.preventDefault();
      clicked = true;
    },
  });

  screen
    .getByRole("link", { name: "Ayuda" })
    .element()
    .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

  expect(clicked).toBe(true);
});

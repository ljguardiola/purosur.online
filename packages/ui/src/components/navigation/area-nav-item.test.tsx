import { LifeBuoy } from "lucide-react";
import type { ReactNode } from "react";
import { expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { expectNoAccessibilityViolations } from "../../test/axe";
import { tokenBackgroundColor, tokenRgb } from "../../test/token-colors";
import { AreaNavItem, type AreaNavItemProps } from "./area-nav-item";

// Contrast assertions need the rail's real background, not the page's default subtle surface.
function Rail({ children }: { children: ReactNode }) {
  return <div className="bg-surface-nav p-2">{children}</div>;
}

function renderItem(props: Omit<AreaNavItemProps, "icon">) {
  return render(
    <Rail>
      <AreaNavItem icon={<LifeBuoy />} {...props} />
    </Rail>,
  );
}

test("renders as a link naming its own label, with the icon hidden from assistive technology", async () => {
  const screen = await renderItem({ label: "Ayuda", active: false, href: "/help" });

  const link = screen.getByRole("link", { name: "Ayuda" }).element() as HTMLAnchorElement;
  expect(link.getAttribute("href")).toBe("/help");
  expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
});

test("marks the active item with aria-current and paints it in the inverse text color over the subtle nav surface", async () => {
  const screen = await renderItem({ label: "Ayuda", active: true, href: "/help" });

  const link = screen.getByRole("link", { name: "Ayuda" }).element() as HTMLAnchorElement;
  expect(link.getAttribute("aria-current")).toBe("page");
  expect(getComputedStyle(link).backgroundColor).toBe(tokenBackgroundColor("surface-nav-subtle"));

  const label = screen.getByText("Ayuda").element();
  expect(getComputedStyle(label).color).toBe(tokenRgb("text-inverse"));
  expect(getComputedStyle(label).fontWeight).toBe("700");
});

test("leaves an inactive item with no aria-current, painted in the subtle inverse text color with no background", async () => {
  const screen = await renderItem({ label: "Ayuda", active: false, href: "/help" });

  const link = screen.getByRole("link", { name: "Ayuda" }).element() as HTMLAnchorElement;
  expect(link.hasAttribute("aria-current")).toBe(false);
  expect(getComputedStyle(link).backgroundColor).toBe("rgba(0, 0, 0, 0)");

  const label = screen.getByText("Ayuda").element();
  expect(getComputedStyle(label).color).toBe(tokenRgb("text-inverse-subtle"));
  expect(getComputedStyle(label).fontWeight).toBe("400");
});

test("forwards a click handler, so the app can drive its own router", async () => {
  let clicked = false;
  const screen = await renderItem({
    label: "Ayuda",
    active: false,
    href: "/help",
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

test("forwards a style to the link, so a router can apply its own inline styles", async () => {
  const screen = await renderItem({
    label: "Ayuda",
    active: false,
    href: "/help",
    style: { opacity: 0.5 },
  });

  const link = screen.getByRole("link", { name: "Ayuda" }).element() as HTMLAnchorElement;
  expect(link.style.opacity).toBe("0.5");
});

function renderLightItem(props: Omit<AreaNavItemProps, "icon" | "rail">) {
  return render(
    <div className="bg-surface p-2">
      <AreaNavItem icon={<LifeBuoy />} rail="light" {...props} />
    </div>,
  );
}

test("marks the active item of the light rail with aria-current, in bold accent text over the subtle action surface", async () => {
  const screen = await renderLightItem({ label: "Caja", active: true, href: "/cash" });

  const link = screen.getByRole("link", { name: "Caja" }).element() as HTMLAnchorElement;
  expect(link.getAttribute("aria-current")).toBe("page");
  expect(getComputedStyle(link).backgroundColor).toBe(tokenBackgroundColor("action-subtle"));
  expect(getComputedStyle(link.querySelector("svg") as SVGSVGElement).color).toBe(
    tokenRgb("text-accent"),
  );

  const label = screen.getByText("Caja").element();
  expect(getComputedStyle(label).color).toBe(tokenRgb("text-accent"));
  expect(getComputedStyle(label).fontWeight).toBe("700");
  await expectNoAccessibilityViolations(screen.container);
});

test("leaves an inactive item of the light rail in the subtle text color, turning its background bone on hover", async () => {
  const screen = await renderLightItem({ label: "Caja", active: false, href: "/cash" });

  const link = screen.getByRole("link", { name: "Caja" }).element() as HTMLAnchorElement;
  expect(link.hasAttribute("aria-current")).toBe(false);
  expect(getComputedStyle(link).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(getComputedStyle(screen.getByText("Caja").element()).color).toBe(tokenRgb("text-subtle"));
  expect(getComputedStyle(screen.getByText("Caja").element()).fontWeight).toBe("400");

  await userEvent.hover(link);
  await expect.poll(() => getComputedStyle(link).backgroundColor).toBe(tokenRgb("surface-subtle"));
  await expectNoAccessibilityViolations(screen.container);
});

test("sizes an item of the light rail for touch, 72px wide with a 24px icon above its label", async () => {
  const screen = await renderLightItem({ label: "Caja", active: false, href: "/cash" });

  const link = screen.getByRole("link", { name: "Caja" }).element() as HTMLAnchorElement;
  const icon = (link.querySelector("svg") as SVGSVGElement).getBoundingClientRect();
  const label = screen.getByText("Caja").element().getBoundingClientRect();
  expect(link.getBoundingClientRect().width).toBe(72);
  expect(getComputedStyle(link).paddingTop).toBe("12px");
  expect(icon.width).toBe(24);
  expect(icon.bottom).toBeLessThanOrEqual(label.top);
});

test("shows the shared focus outline on an item of the light rail reached by keyboard", async () => {
  const screen = await renderLightItem({ label: "Caja", active: false, href: "/cash" });
  const link = screen.getByRole("link", { name: "Caja" }).element() as HTMLAnchorElement;

  await userEvent.tab();

  expect(document.activeElement).toBe(link);
  await expect.poll(() => getComputedStyle(link).outlineWidth).toBe("3px");
  await expect.poll(() => getComputedStyle(link).outlineColor).toBe(tokenRgb("focus"));
});

test("keeps the dark rail's look when it is given no rail", async () => {
  const screen = await render(
    <Rail>
      <AreaNavItem icon={<LifeBuoy />} label="Ayuda" active href="/help" />
      <AreaNavItem icon={<LifeBuoy />} label="Ayuda oscura" active href="/help" rail="dark" />
    </Rail>,
  );

  const implicit = screen.getByRole("link", { name: "Ayuda", exact: true }).element();
  const explicit = screen.getByRole("link", { name: "Ayuda oscura" }).element();
  expect(getComputedStyle(implicit).backgroundColor).toBe(
    getComputedStyle(explicit).backgroundColor,
  );
  expect(implicit.getBoundingClientRect().width).toBe(explicit.getBoundingClientRect().width);
});
